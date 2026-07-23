OpenCV 图片实验室 · 离线教学版
================================

一、如何启动
------------

1. 解压整个文件夹。
2. 确保这些文件始终放在同一目录：

   index.html
   pipeline.html
   pipeline.css
   pipeline-stage.css
   pipeline-operations.js
   pipeline-editor.js
   pipeline-app.js
   pipeline-mode.js
   opencv.js

3. 双击需要的入口：

   - index.html：单步实验模式。每次只运行一个 OpenCV 操作，并从原图重新开始。
   - pipeline.html：流水线模式。把多个操作按顺序连接，上一节点输出会成为下一节点输入。

4. 等待页面右上角显示“OpenCV 已就绪 · 4.6.0”。
5. 点击“打开内置示例”，或选择你自己的图片。

整个网页不需要联网，也不需要安装 Node.js、Python 或前端框架。
图片只在浏览器内存中处理，不会上传。

二、单步实验模式
----------------

index.html 包含六个独立实验：

1. 灰度化
   cv.cvtColor()：把 RGBA 彩色图转换为单通道灰度图。

2. 高斯模糊
   cv.GaussianBlur()：调整卷积核和 Sigma，观察细节与噪声如何被平滑。

3. 二值化
   cv.threshold()：普通、反向、Otsu 和反向 Otsu 四种模式。

4. Canny 边缘检测
   cv.Canny()：调整双阈值、预模糊、Sobel 孔径和 L2 梯度。

5. 形态学
   cv.erode()、cv.dilate()、cv.morphologyEx()：腐蚀、膨胀、开与闭运算。

6. 轮廓检测
   cv.findContours()：显示轮廓面积、周长、外接矩形和编号。

每次切换实验时，都从原始图片重新处理，不会把上一步结果作为输入。
右侧会同步显示当前参数对应的 JavaScript 代码、矩阵类型、处理耗时和资源释放数量。

三、流水线模式
--------------

pipeline.html 支持把下面六种节点组合成有序流程：

- 灰度化
- 高斯模糊
- 二值化
- Canny 边缘检测
- 形态学
- 轮廓检测

流水线模式提供：

- 添加、删除、启用、禁用、上移和下移节点
- 每个节点的独立参数编辑
- 巡线提取、边缘检测、二值清理三个预设
- 参数或顺序改变后的自动重新运行
- 每个启用节点的中间结果预览
- 最终结果 PNG 下载
- 流水线 JSON 导入与导出
- 等价 OpenCV.js 代码生成与复制

典型巡线流程：

原图 → 灰度化 → 高斯模糊 → 反向二值化 → 闭运算 → 轮廓检测

流水线文件只保存节点、顺序、启用状态和参数，不包含图片。

四、开发检查
------------

项目运行不需要 Node.js。只有在修改源码并运行自动化检查时才需要 Node.js：

   npm test
   npm run check

测试使用 Node.js 内置 node:test，不需要安装第三方依赖。

五、常见问题
------------

1. 页面提示“OpenCV 加载失败”

   请确认 opencv.js 没有被删除或重命名，并且与所打开的 HTML 文件在同一个文件夹中。
   流水线模式还要求 pipeline.css、pipeline-stage.css、pipeline-operations.js、pipeline-editor.js、pipeline-app.js 和 pipeline-mode.js 与 pipeline.html 同目录。
   建议使用最新版桌面 Chrome、Edge 或 Firefox 打开，不要在聊天软件内置浏览器中运行。

2. 处理很慢或浏览器内存占用较高

   页面会把超大图片的最长边缩放到 1800 像素后再处理，以降低 WebAssembly 内存压力。
   节点很多、轮廓很多或卷积核较大时仍可能变慢，可以先禁用部分节点定位瓶颈。

3. 为什么必须调用 delete()？

   cv.Mat、cv.MatVector 和结构元素存放在 WebAssembly 内存中。
   JavaScript 垃圾回收不能保证及时释放它们，所以流水线引擎和各处理节点会显式释放拥有的资源。

4. 为什么下载的是 PNG？

   Canvas 可以稳定导出 PNG，避免重复压缩造成学习时难以判断算法本身的影响。

5. 为什么某些步骤顺序会报错或效果异常？

   流水线会把上一节点输出直接交给下一节点。Canny、阈值和轮廓节点会自动转换灰度；
   形态学会直接处理当前矩阵，通常应放在二值化之后。可以从内置预设开始调整。

六、文件说明
------------

index.html            单步实验页面、样式、教学内容和 OpenCV 调用代码
pipeline.html         流水线模式页面结构
pipeline.css          流水线模式外壳、构建器与基础样式
pipeline-stage.css    画布、中间结果、参数编辑器与响应式样式
pipeline-operations.js  六种 OpenCV 节点、默认参数和三个预设
pipeline-editor.js    节点列表、参数编辑器和代码生成
pipeline-app.js       图片、运行、预览、导入导出和初始化逻辑
pipeline-mode.js      与界面无关的有序流水线引擎和矩阵生命周期管理
opencv.js             OpenCV.js 4.6.0 单文件运行时，WebAssembly 已内嵌
PIPELINE_MODE.md      流水线架构、数据格式和扩展说明
package.json          自动化检查命令
LICENSE-OpenCV.txt    OpenCV 使用的 Apache License 2.0
README.txt            本说明

OpenCV.js 文件 SHA-256：
fced3a671afb61d57b325d4bd380ef73296ecb24b147a7034e91523392e63605

版本说明：页面启动后会从 cv.getBuildInformation() 读取并显示运行时版本。
