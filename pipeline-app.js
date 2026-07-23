'use strict';

function renderPreviewEmpty() {
  const grid = $('#previewGrid');
  if (grid.children.length) return;
  const empty = document.createElement('div');
  empty.className = 'preview-empty';
  empty.textContent = state.imageLoaded ? '运行流水线后，这里会依次显示每个启用步骤的输出。' : '先打开一张图片。';
  grid.append(empty);
}

function renderPreviews(history) {
  const grid = $('#previewGrid');
  grid.replaceChildren();
  history.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'preview-card';
    const header = document.createElement('div');
    header.className = 'preview-card-header';
    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${item.label}`;
    const meta = document.createElement('span');
    meta.textContent = `${item.image.cols}×${item.image.rows} · ${item.elapsedMs.toFixed(1)}ms`;
    header.append(title, meta);
    const viewport = document.createElement('div');
    viewport.className = 'preview-viewport';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', `${item.label} 中间结果`);
    viewport.append(canvas);
    card.append(header, viewport);
    grid.append(card);
    cv.imshow(canvas, item.image);
  });
  if (!history.length) renderPreviewEmpty();
  $('#previewCount').textContent = `${history.length} 张`;
}

function scheduleRun(immediate = false) {
  clearTimeout(state.processTimer);
  if (!state.cvReady || !state.imageLoaded || state.pipeline.steps.length === 0) {
    updateActionStates();
    return;
  }
  state.processTimer = setTimeout(runPipeline, immediate ? 0 : 110);
}

function runPipeline() {
  if (state.processing || !state.cvReady || !state.imageLoaded || state.pipeline.steps.length === 0) return;
  clearTimeout(state.processTimer);
  clearError();
  setProcessing(true);
  state.execution?.dispose();
  state.execution = null;
  state.reports = {};
  let src = null;

  try {
    src = cv.imread($('#sourceCanvas'));
    const execution = state.pipeline.run(src, { keepHistory: true, context: { reports: state.reports } });
    state.execution = execution;
    cv.imshow($('#resultCanvas'), execution.result);
    renderPreviews(execution.history);

    $('#resultCard').classList.add('has-image');
    $('#resultMeta').textContent = `${execution.result.cols} × ${execution.result.rows} · ${channelsOf(execution.result)} ch`;
    $('#resultBadge').textContent = `输出 ${execution.result.cols} × ${execution.result.rows}`;
    $('#metricTime').textContent = `${execution.metadata.elapsedMs.toFixed(2)} ms`;
    $('#metricSteps').textContent = String(execution.history.length);
    $('#metricShape').textContent = `${execution.result.cols} × ${execution.result.rows} × ${channelsOf(execution.result)}`;
    const contourReports = Object.values(state.reports).filter(item => Number.isFinite(item?.keptContours));
    $('#metricContours').textContent = contourReports.length ? String(contourReports.at(-1).keptContours) : '—';
    $('#runBadge').textContent = `${execution.metadata.elapsedMs.toFixed(1)} ms`;
    updateActionStates();
  } catch (error) {
    console.error(error);
    showError(`流水线执行失败：${error && error.message ? error.message : String(error)}`);
    $('#runBadge').textContent = '执行失败';
    showToast('流水线执行失败，请检查步骤顺序或参数。', 'error');
  } finally {
    state.execution?.dispose();
    state.execution = null;
    deleteMat(src);
    setProcessing(false);
    updateActionStates();
  }
}

function markImageReady(name) {
  state.imageLoaded = true;
  state.imageName = name;
  document.body.dataset.imageReady = 'true';
  $('#sourceCard').classList.add('has-image');
  $('#imageName').textContent = name;
  const canvas = $('#sourceCanvas');
  $('#sourceBadge').textContent = `输入 ${canvas.width} × ${canvas.height}`;
  $('#sourceMeta').textContent = `${canvas.width} × ${canvas.height} · RGBA`;
  clearRenderedResult();
  renderPreviewEmpty();
  scheduleRun(true);
  updateActionStates();
}

function fitDimensions(width, height) {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

function drawImageElement(image, name) {
  const canvas = $('#sourceCanvas');
  const size = fitDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  markImageReady(name);
  if (size.scale < 1) showToast(`图片已缩放到 ${size.width} × ${size.height}，避免浏览器内存过高。`);
}

function loadImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('请选择浏览器支持的图片文件。', 'error');
    return;
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    try {
      drawImageElement(image, file.name);
      showToast(`已打开 ${file.name}`, 'success');
    } finally {
      URL.revokeObjectURL(url);
      $('#fileInput').value = '';
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    $('#fileInput').value = '';
    showToast('浏览器无法解码这张图片。', 'error');
  };
  image.src = url;
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function createSampleImage() {
  const canvas = $('#sourceCanvas');
  canvas.width = 960;
  canvas.height = 600;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const gradient = context.createLinearGradient(0, 0, 960, 600);
  gradient.addColorStop(0, '#e0f2fe');
  gradient.addColorStop(1, '#dff7f3');
  context.fillStyle = gradient;
  roundRect(context, 36, 34, 888, 532, 34);
  context.fill();

  context.fillStyle = '#ffffff';
  roundRect(context, 86, 78, 788, 444, 28);
  context.fill();

  context.strokeStyle = '#111827';
  context.lineWidth = 34;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(150, 468);
  context.bezierCurveTo(300, 390, 250, 285, 435, 302);
  context.bezierCurveTo(625, 320, 590, 160, 800, 126);
  context.stroke();

  context.strokeStyle = '#94a3b8';
  context.lineWidth = 3;
  context.setLineDash([14, 12]);
  context.beginPath();
  context.moveTo(150, 468);
  context.bezierCurveTo(300, 390, 250, 285, 435, 302);
  context.bezierCurveTo(625, 320, 590, 160, 800, 126);
  context.stroke();
  context.setLineDash([]);

  const objects = [
    { x: 170, y: 130, w: 105, h: 70, color: '#f59e0b' },
    { x: 690, y: 385, w: 120, h: 82, color: '#2563eb' },
    { x: 470, y: 115, w: 88, h: 88, color: '#0f766e' }
  ];
  for (const object of objects) {
    context.fillStyle = object.color;
    roundRect(context, object.x, object.y, object.w, object.h, 18);
    context.fill();
  }

  context.fillStyle = '#172033';
  context.font = '800 28px system-ui, sans-serif';
  context.fillText('Pipeline Demo', 110, 120);
  context.fillStyle = '#64748b';
  context.font = '500 18px system-ui, sans-serif';
  context.fillText('灰度 → 模糊 → 二值 → 形态学 → 轮廓', 110, 150);
  markImageReady('内置流水线示例.png');
  showToast('已打开内置流水线示例。', 'success');
}

function inspectPixel(canvas, output) {
  let framePending = false;
  let latestEvent = null;
  canvas.addEventListener('mousemove', event => {
    latestEvent = event;
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      if (!latestEvent || canvas.width === 0 || canvas.height === 0) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((latestEvent.clientX - rect.left) * canvas.width / rect.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((latestEvent.clientY - rect.top) * canvas.height / rect.height)));
      try {
        const pixel = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
        output.textContent = `x: ${x} · y: ${y} · RGBA: ${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${pixel[3]}`;
      } catch {
        output.textContent = `x: ${x} · y: ${y} · 像素不可读取`;
      }
    });
  });
  canvas.addEventListener('mouseleave', () => {
    latestEvent = null;
    output.textContent = 'x: — · y: — · RGBA: —';
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function downloadResult() {
  const canvas = $('#resultCanvas');
  if (!canvas.width || !canvas.height) return;
  const filename = `${sanitizeFileBase(state.imageName)}-pipeline.png`;
  canvas.toBlob(blob => {
    if (!blob) {
      showToast('生成 PNG 失败。', 'error');
      return;
    }
    triggerDownload(blob, filename);
    showToast(`已生成 ${filename}`, 'success');
  }, 'image/png');
}

function exportPipelineJson() {
  const content = JSON.stringify(state.pipeline.serialize(), null, 2);
  triggerDownload(new Blob([content], { type: 'application/json;charset=utf-8' }), 'opencv-pipeline.json');
  showToast('流水线 JSON 已导出。', 'success');
}

function importPipelineJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.pipeline.load(String(reader.result));
      state.selectedStepId = state.pipeline.steps[0]?.id || null;
      renderAllEditors();
      clearRenderedResult();
      scheduleRun(true);
      showToast('流水线 JSON 已导入。', 'success');
    } catch (error) {
      showToast(`导入失败：${error.message}`, 'error');
    } finally {
      $('#pipelineJsonInput').value = '';
    }
  };
  reader.onerror = () => showToast('无法读取流水线文件。', 'error');
  reader.readAsText(file, 'utf-8');
}

async function copyExportCode() {
  const code = $('#exportCode').textContent;
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(code);
    else {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('copy rejected');
    }
    showToast('流水线代码已复制。', 'success');
  } catch {
    showToast('当前浏览器不允许自动复制，请手动选择代码。', 'error');
  }
}

function detectVersion() {
  try {
    const match = cv.getBuildInformation().match(/General configuration for OpenCV\s+([^\s]+)/);
    return match ? match[1] : '已加载';
  } catch {
    return '已加载';
  }
}

function markOpenCvReady(instance) {
  if (state.cvReady) return;
  if (instance) window.cv = instance;
  if (!window.cv || typeof window.cv.Mat !== 'function') return;
  state.cvReady = true;
  document.body.dataset.cvReady = 'true';
  setStatus('ready', `OpenCV 已就绪 · ${detectVersion()}`);
  updateActionStates();
  scheduleRun(true);
}

function initializeOpenCV() {
  if (window.__opencvScriptError) {
    setStatus('error', 'OpenCV 加载失败');
    showError('找不到同目录下的 opencv.js。请保持 pipeline.html、pipeline-app.js、pipeline-mode.js 与 opencv.js 在同一文件夹。');
    return;
  }

  const probe = () => {
    if (state.cvReady) return;
    const candidate = window.cv;
    if (candidate && typeof candidate.then === 'function') {
      candidate.then(markOpenCvReady).catch(error => {
        setStatus('error', 'OpenCV 初始化失败');
        showError(`OpenCV 初始化失败：${error.message || error}`);
      });
      return;
    }
    if (candidate && typeof candidate.Mat === 'function') {
      markOpenCvReady(candidate);
      return;
    }
    if (candidate && !state.openCvHooked) {
      state.openCvHooked = true;
      const previous = candidate.onRuntimeInitialized;
      candidate.onRuntimeInitialized = () => {
        if (typeof previous === 'function') previous();
        markOpenCvReady(candidate);
      };
    }
    if (Date.now() - state.openCvStartedAt > 30000) {
      setStatus('error', 'OpenCV 初始化超时');
      showError('OpenCV.js 在 30 秒内没有完成初始化。建议使用最新版桌面 Chrome、Edge 或 Firefox。');
      return;
    }
    setTimeout(probe, 60);
  };
  probe();
}

function bindEvents() {
  const openPicker = () => $('#fileInput').click();
  $('#topUploadButton').addEventListener('click', openPicker);
  $('#uploadZone').addEventListener('click', openPicker);
  $('#uploadZone').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  });
  $('#fileInput').addEventListener('change', event => loadImageFile(event.target.files?.[0]));
  $('#sampleButton').addEventListener('click', createSampleImage);
  $('#runButton').addEventListener('click', runPipeline);
  $('#downloadButton').addEventListener('click', downloadResult);
  $('#applyPresetButton').addEventListener('click', () => applyPreset($('#presetSelect').value));
  $('#clearPipelineButton').addEventListener('click', () => {
    state.pipeline.clear();
    state.selectedStepId = null;
    renderAllEditors();
    clearRenderedResult();
    showToast('流水线步骤已清空。');
  });
  $('#exportJsonButton').addEventListener('click', exportPipelineJson);
  $('#importJsonButton').addEventListener('click', () => $('#pipelineJsonInput').click());
  $('#pipelineJsonInput').addEventListener('change', event => importPipelineJson(event.target.files?.[0]));
  $('#copyCodeButton').addEventListener('click', copyExportCode);

  const zone = $('#uploadZone');
  for (const eventName of ['dragenter', 'dragover']) {
    zone.addEventListener(eventName, event => {
      event.preventDefault();
      zone.classList.add('dragging');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    zone.addEventListener(eventName, event => {
      event.preventDefault();
      zone.classList.remove('dragging');
    });
  }
  zone.addEventListener('drop', event => loadImageFile(event.dataTransfer?.files?.[0]));
  document.addEventListener('dragover', event => event.preventDefault());
  document.addEventListener('drop', event => event.preventDefault());

  inspectPixel($('#sourceCanvas'), $('#sourcePixel'));
  inspectPixel($('#resultCanvas'), $('#resultPixel'));
  window.addEventListener('beforeunload', () => state.execution?.dispose());
}

function start() {
  if (typeof window.OpenCVPipeline !== 'function') {
    setStatus('error', '流水线引擎缺失');
    showError('找不到或无法加载 pipeline-mode.js。');
    return;
  }
  state.pipeline = new window.OpenCVPipeline({ registry: OPERATION_REGISTRY });
  bindEvents();
  renderOperationPalette();
  applyPreset('lineTracking', false);
  renderPreviewEmpty();
  initializeOpenCV();
}

start();
