# OpenCV Pipeline Mode

## 状态

流水线模式已经作为独立离线入口 `pipeline.html` 实现。现有 `index.html` 保留为单步实验模式，因此旧用法和教学内容不受影响。

## 使用方法

把以下文件放在同一目录并双击 `pipeline.html`：

- `pipeline.html`
- `pipeline.css`
- `pipeline-stage.css`
- `pipeline-operations.js`
- `pipeline-editor.js`
- `pipeline-app.js`
- `pipeline-mode.js`
- `opencv.js`

页面完全在浏览器本地运行，不发送图片或流水线配置。

## 首版能力

- 六种有序处理节点：灰度化、高斯模糊、二值化、Canny、形态学、轮廓检测
- 添加、删除、启停、上移和下移节点
- 每个节点的参数编辑和自动重算
- 每个启用节点的独立中间结果预览
- 巡线提取、边缘检测、二值清理三个预设
- 最终结果 PNG 下载
- 流水线 JSON 导入与导出
- 等价 OpenCV.js 教学代码生成与复制

## 架构

### `pipeline-mode.js`

UI 无关的有序执行引擎。它通过注册表取得步骤定义，维护步骤 ID、类型、标签、启用状态和参数，并提供：

```js
const pipeline = new OpenCVPipeline({ registry });

pipeline.add('grayscale');
pipeline.add('gaussian', { kernel: 5, sigma: 0 });
pipeline.move(stepId, -1);
pipeline.update(stepId, { kernel: 7 });
pipeline.toggle(stepId, false);
pipeline.remove(stepId);

const execution = pipeline.run(inputMat, { keepHistory: true });
// execution.result
// execution.history
execution.dispose();
```

`run()` 会克隆调用方传入的矩阵。引擎只释放自己拥有的工作矩阵、最终矩阵和历史预览矩阵，不会删除调用方的输入矩阵。

### `pipeline-operations.js`

定义六种 OpenCV 节点、默认参数、参数控件元数据和三个预设。每个节点负责释放自己的临时矩阵。

### `pipeline-editor.js`

负责节点列表、选择/排序/启停、动态参数编辑器、预设应用和等价 OpenCV.js 代码生成。

### `pipeline-app.js`

负责图片加载、最长边 1800 像素缩放、OpenCV.js 初始化、运行调度、中间预览、PNG/JSON 导入导出、错误提示和浏览器事件。

### `pipeline.html`、`pipeline.css` 与 `pipeline-stage.css`

页面结构与样式分离：`pipeline.css` 负责外壳和构建器，`pipeline-stage.css` 负责画布、中间结果、参数编辑器和响应式布局。所有资源均从同目录加载，不使用 CDN、框架或构建产物。

## 数据流

```text
sourceCanvas
    ↓ cv.imread()
输入 Mat 的引擎副本
    ↓
步骤 1 输出 ──→ 中间预览 1
    ↓
步骤 2 输出 ──→ 中间预览 2
    ↓
……
    ↓
最终输出 ──→ resultCanvas
```

禁用的节点会保留在配置中，但执行时跳过。调整顺序、参数或启用状态后，页面会自动重新运行。

## JSON 格式

当前格式版本为 `1`：

```json
{
  "version": 1,
  "steps": [
    {
      "id": "step-1",
      "type": "gaussian",
      "label": "高斯模糊",
      "enabled": true,
      "params": {
        "kernel": 5,
        "sigma": 0
      }
    }
  ]
}
```

导入时会验证格式版本、节点类型、参数对象和步骤 ID。未知节点或重复 ID 会被拒绝，避免执行不完整配置。

## 内存所有权

OpenCV.js 的 `cv.Mat`、`cv.MatVector` 和结构元素位于 WebAssembly 内存中，不能只依赖 JavaScript 垃圾回收。

- 各节点负责释放内部临时矩阵和核。
- 引擎在成功切换工作矩阵时释放上一矩阵。
- 引擎在异常时释放已拥有的工作矩阵与历史矩阵。
- 页面在绘制完最终结果和预览后调用 `execution.dispose()`。
- 原始 `cv.imread()` 输入由页面在 `finally` 中释放。

## 自动化检查

```bash
npm test
npm run check
```

检查包括：

- 步骤默认参数隔离
- 增删、移动、更新和启停
- JSON 往返、未知类型与步骤 ID 唯一性
- 有序执行、中间预览独立性和异常清理
- 页面关键入口、脚本依赖、六种节点和三个预设
- 四个项目 JavaScript 文件的语法检查

## 后续扩展方向

- 拖拽排序与键盘无障碍排序增强
- ROI 裁剪、HSV 分割、直线与圆检测节点
- Python 与 C++ 导出器
- 摄像头和视频逐帧流水线
- 分支、合流与节点连线式 DAG 编辑器
- 配置迁移器和可分享的教学案例库
