'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const MAX_IMAGE_EDGE = 1800;

function deleteMat(value) {
  if (value && typeof value.delete === 'function') value.delete();
}

function channelsOf(mat) {
  return mat && typeof mat.channels === 'function' ? mat.channels() : 0;
}

function ensureGray(src) {
  const channels = channelsOf(src);
  if (channels === 1) return src.clone();
  const dst = new cv.Mat();
  try {
    if (channels === 4) cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
    else if (channels === 3) cv.cvtColor(src, dst, cv.COLOR_RGB2GRAY);
    else throw new Error(`无法把 ${channels} 通道矩阵转换为灰度图。`);
    return dst;
  } catch (error) {
    dst.delete();
    throw error;
  }
}

function ensureRgba(src) {
  const channels = channelsOf(src);
  if (channels === 4) return src.clone();
  const dst = new cv.Mat();
  try {
    if (channels === 1) cv.cvtColor(src, dst, cv.COLOR_GRAY2RGBA);
    else if (channels === 3) cv.cvtColor(src, dst, cv.COLOR_RGB2RGBA);
    else throw new Error(`无法把 ${channels} 通道矩阵转换为 RGBA。`);
    return dst;
  } catch (error) {
    dst.delete();
    throw error;
  }
}

function report(runtime, data) {
  if (runtime && runtime.reports && runtime.step) runtime.reports[runtime.step.id] = data;
}

const OPERATION_REGISTRY = {
  grayscale: {
    label: '灰度化',
    icon: 'G',
    summary: 'RGBA → 单通道亮度',
    description: '把当前输入转换为单通道灰度图。',
    defaults: {},
    controls: [],
    process(src) {
      return ensureGray(src);
    }
  },

  gaussian: {
    label: '高斯模糊',
    icon: 'σ',
    summary: '降低噪声与细节',
    description: '使用高斯卷积平滑图像，为阈值和边缘步骤抑制噪声。',
    defaults: { kernel: 5, sigma: 0 },
    controls: [
      {
        key: 'kernel', label: '卷积核', type: 'select',
        options: [3, 5, 7, 9, 11, 15].map(value => ({ value, label: `${value} × ${value}` })),
        help: '卷积核必须为正奇数；越大越平滑，也越容易丢失细节。'
      },
      { key: 'sigma', label: 'Sigma X', type: 'range', min: 0, max: 10, step: 0.1, help: '设为 0 时由 OpenCV 根据卷积核自动估算。' }
    ],
    process(src, params) {
      const dst = new cv.Mat();
      try {
        cv.GaussianBlur(src, dst, new cv.Size(Number(params.kernel), Number(params.kernel)), Number(params.sigma), 0, cv.BORDER_DEFAULT);
        return dst;
      } catch (error) {
        dst.delete();
        throw error;
      }
    }
  },

  threshold: {
    label: '二值化',
    icon: '01',
    summary: '阈值分割前景与背景',
    description: '先转灰度，再应用普通、反向或 Otsu 阈值。',
    defaults: { value: 120, maxValue: 255, mode: 'binary' },
    controls: [
      {
        key: 'mode', label: '阈值模式', type: 'select',
        options: [
          { value: 'binary', label: '普通二值' },
          { value: 'binaryInv', label: '反向二值' },
          { value: 'otsu', label: 'Otsu 自动' },
          { value: 'otsuInv', label: 'Otsu 自动反向' }
        ],
        help: 'Otsu 模式会自动寻找分割阈值。'
      },
      { key: 'value', label: '阈值', type: 'range', min: 0, max: 255, step: 1, help: '像素高于或低于该值时被分到不同类别。', disabledWhen: params => String(params.mode).startsWith('otsu') },
      { key: 'maxValue', label: '前景值', type: 'range', min: 1, max: 255, step: 1, help: '满足条件的像素写入这个值，通常为 255。' }
    ],
    process(src, params, runtime) {
      const gray = ensureGray(src);
      let dst = null;
      const mode = String(params.mode);
      let type = mode.endsWith('Inv') ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY;
      if (mode.startsWith('otsu')) type |= cv.THRESH_OTSU;
      try {
        dst = new cv.Mat();
        const actual = cv.threshold(gray, dst, mode.startsWith('otsu') ? 0 : Number(params.value), Number(params.maxValue), type);
        report(runtime, { actualThreshold: actual });
        return dst;
      } catch (error) {
        deleteMat(dst);
        throw error;
      } finally {
        gray.delete();
      }
    }
  },

  canny: {
    label: 'Canny 边缘',
    icon: '∂',
    summary: '双阈值连接真实边缘',
    description: '在灰度图上执行可选预模糊与 Canny 边缘检测。',
    defaults: { low: 60, high: 150, blurKernel: 3, aperture: 3, l2Gradient: false },
    controls: [
      { key: 'low', label: '低阈值', type: 'range', min: 0, max: 254, step: 1, help: '弱边缘低于此值会被丢弃。' },
      { key: 'high', label: '高阈值', type: 'range', min: 1, max: 255, step: 1, help: '高于此值的像素被视为强边缘。' },
      {
        key: 'blurKernel', label: '预模糊', type: 'select',
        options: [{ value: 1, label: '关闭' }, 3, 5, 7, 9].map(item => typeof item === 'object' ? item : ({ value: item, label: `${item} × ${item}` })),
        help: '边缘检测前先抑制噪声；1 表示关闭。'
      },
      {
        key: 'aperture', label: 'Sobel 孔径', type: 'select',
        options: [3, 5, 7].map(value => ({ value, label: String(value) })),
        help: '梯度计算使用的 Sobel 核尺寸。'
      },
      { key: 'l2Gradient', label: '使用 L2 梯度', type: 'checkbox', help: '计算更精确的梯度幅值，但会稍慢。' }
    ],
    process(src, params) {
      const gray = ensureGray(src);
      let input = gray;
      let blurred = null;
      let dst = null;
      try {
        dst = new cv.Mat();
        const blurKernel = Number(params.blurKernel);
        if (blurKernel > 1) {
          blurred = new cv.Mat();
          cv.GaussianBlur(gray, blurred, new cv.Size(blurKernel, blurKernel), 0, 0, cv.BORDER_DEFAULT);
          input = blurred;
        }
        const low = Math.min(Number(params.low), Number(params.high) - 1);
        const high = Math.max(Number(params.high), low + 1);
        cv.Canny(input, dst, low, high, Number(params.aperture), Boolean(params.l2Gradient));
        return dst;
      } catch (error) {
        deleteMat(dst);
        throw error;
      } finally {
        deleteMat(blurred);
        gray.delete();
      }
    }
  },

  morphology: {
    label: '形态学',
    icon: 'M',
    summary: '腐蚀、膨胀、开与闭',
    description: '使用结构元素处理当前矩阵；通常放在二值化之后。',
    defaults: { mode: 'close', shape: 'ellipse', kernel: 5, iterations: 1 },
    controls: [
      {
        key: 'mode', label: '运算', type: 'select',
        options: [
          { value: 'erode', label: '腐蚀' },
          { value: 'dilate', label: '膨胀' },
          { value: 'open', label: '开运算' },
          { value: 'close', label: '闭运算' }
        ],
        help: '开运算去小噪点，闭运算填小孔洞。'
      },
      {
        key: 'shape', label: '结构元素', type: 'select',
        options: [
          { value: 'rect', label: '矩形' },
          { value: 'cross', label: '十字' },
          { value: 'ellipse', label: '椭圆' }
        ],
        help: '结构元素形状会影响扩张或收缩方向。'
      },
      {
        key: 'kernel', label: '核尺寸', type: 'select',
        options: [3, 5, 7, 9, 11, 15].map(value => ({ value, label: `${value} × ${value}` })),
        help: '尺寸越大，形态学作用越强。'
      },
      { key: 'iterations', label: '迭代次数', type: 'range', min: 1, max: 8, step: 1, help: '重复执行相同运算的次数。' }
    ],
    process(src, params) {
      const shapeMap = { rect: cv.MORPH_RECT, cross: cv.MORPH_CROSS, ellipse: cv.MORPH_ELLIPSE };
      const kernel = cv.getStructuringElement(shapeMap[params.shape] ?? cv.MORPH_ELLIPSE, new cv.Size(Number(params.kernel), Number(params.kernel)));
      let dst = null;
      const anchor = new cv.Point(-1, -1);
      const iterations = Number(params.iterations);
      try {
        dst = new cv.Mat();
        if (params.mode === 'erode') {
          cv.erode(src, dst, kernel, anchor, iterations, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
        } else if (params.mode === 'dilate') {
          cv.dilate(src, dst, kernel, anchor, iterations, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
        } else {
          const mode = params.mode === 'open' ? cv.MORPH_OPEN : cv.MORPH_CLOSE;
          cv.morphologyEx(src, dst, mode, kernel, anchor, iterations, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
        }
        return dst;
      } catch (error) {
        deleteMat(dst);
        throw error;
      } finally {
        kernel.delete();
      }
    }
  },

  contours: {
    label: '轮廓检测',
    icon: 'C',
    summary: '轮廓、面积与外接框',
    description: '对当前输入再次阈值分割，绘制满足最小面积的轮廓与外接矩形。',
    defaults: { threshold: 120, invert: false, minArea: 200, retrieval: 'external', drawBoxes: true, lineWidth: 2 },
    controls: [
      { key: 'threshold', label: '检测阈值', type: 'range', min: 0, max: 255, step: 1, help: '轮廓检测前使用的二值阈值。' },
      { key: 'invert', label: '反向二值', type: 'checkbox', help: '适合深色目标位于浅色背景的情况。' },
      { key: 'minArea', label: '最小面积', type: 'range', min: 0, max: 20000, step: 20, help: '过滤面积小于该值的轮廓。' },
      {
        key: 'retrieval', label: '检索模式', type: 'select',
        options: [
          { value: 'external', label: '仅外轮廓' },
          { value: 'list', label: '全部列表' },
          { value: 'tree', label: '完整层级' }
        ],
        help: '外轮廓最适合常见目标计数。'
      },
      { key: 'drawBoxes', label: '绘制外接矩形', type: 'checkbox', help: '在轮廓结果上叠加蓝色矩形。' },
      { key: 'lineWidth', label: '线宽', type: 'range', min: 1, max: 8, step: 1, help: '轮廓和矩形的绘制宽度。' }
    ],
    process(src, params, runtime) {
      let gray = null;
      let binary = null;
      let contours = null;
      let hierarchy = null;
      let dst = null;
      try {
        gray = ensureGray(src);
        binary = new cv.Mat();
        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.threshold(gray, binary, Number(params.threshold), 255, params.invert ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY);
        const retrievalMap = { external: cv.RETR_EXTERNAL, list: cv.RETR_LIST, tree: cv.RETR_TREE };
        cv.findContours(binary, contours, hierarchy, retrievalMap[params.retrieval] ?? cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        dst = ensureRgba(src);
        const contourColor = new cv.Scalar(15, 118, 110, 255);
        const boxColor = new cv.Scalar(37, 99, 235, 255);
        const kept = [];

        for (let index = 0; index < contours.size(); index += 1) {
          const contour = contours.get(index);
          try {
            const area = cv.contourArea(contour, false);
            if (area < Number(params.minArea)) continue;
            const rect = cv.boundingRect(contour);
            const perimeter = cv.arcLength(contour, true);
            kept.push({ area, perimeter, rect });
            cv.drawContours(dst, contours, index, contourColor, Number(params.lineWidth), cv.LINE_8, hierarchy, 0);
            if (params.drawBoxes) {
              cv.rectangle(dst, new cv.Point(rect.x, rect.y), new cv.Point(rect.x + rect.width, rect.y + rect.height), boxColor, Number(params.lineWidth), cv.LINE_8, 0);
            }
          } finally {
            contour.delete();
          }
        }
        kept.sort((a, b) => b.area - a.area);
        report(runtime, { totalContours: contours.size(), keptContours: kept.length, contours: kept.slice(0, 20) });
        return dst;
      } catch (error) {
        deleteMat(dst);
        throw error;
      } finally {
        deleteMat(gray);
        deleteMat(binary);
        deleteMat(contours);
        deleteMat(hierarchy);
      }
    }
  }
};

const PRESETS = {
  lineTracking: [
    { type: 'grayscale' },
    { type: 'gaussian', params: { kernel: 5, sigma: 0 } },
    { type: 'threshold', params: { value: 110, maxValue: 255, mode: 'binaryInv' } },
    { type: 'morphology', params: { mode: 'close', shape: 'ellipse', kernel: 7, iterations: 1 } },
    { type: 'contours', params: { threshold: 80, invert: false, minArea: 500, retrieval: 'external', drawBoxes: true, lineWidth: 3 } }
  ],
  edgeDetection: [
    { type: 'grayscale' },
    { type: 'gaussian', params: { kernel: 5, sigma: 0 } },
    { type: 'canny', params: { low: 55, high: 150, blurKernel: 3, aperture: 3, l2Gradient: true } }
  ],
  binaryCleanup: [
    { type: 'grayscale' },
    { type: 'threshold', params: { value: 125, maxValue: 255, mode: 'otsu' } },
    { type: 'morphology', params: { mode: 'open', shape: 'ellipse', kernel: 3, iterations: 1 } },
    { type: 'morphology', params: { mode: 'close', shape: 'ellipse', kernel: 7, iterations: 1 } }
  ]
};

const state = {
  pipeline: null,
  cvReady: false,
  imageLoaded: false,
  processing: false,
  selectedStepId: null,
  processTimer: 0,
  imageName: '',
  execution: null,
  reports: {},
  openCvHooked: false,
  openCvStartedAt: Date.now()
};
