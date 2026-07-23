# OpenCV Pipeline Mode

## Purpose

Add a workflow-style image processing mode:

Input Image

↓

Gray

↓

Blur

↓

Threshold

↓

Contour / Feature extraction

## Architecture

`OpenCVPipeline` manages ordered processors.

Each processor:

- receives cv.Mat
- returns cv.Mat
- can be displayed as an intermediate result

## Future UI integration

- Add pipeline tab
- Drag/drop processing nodes
- Show every intermediate image
- Export pipeline as OpenCV Python/C++ code

This structure matches industrial vision workflows such as inspection pipelines.
