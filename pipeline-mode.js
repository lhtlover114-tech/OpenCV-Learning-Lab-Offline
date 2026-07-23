/*
 * OpenCV Learning Lab - Pipeline Mode Engine
 *
 * Provides a lightweight vision pipeline abstraction.
 * Each processor receives a cv.Mat and returns a new cv.Mat.
 *
 * Example:
 * const pipe = new OpenCVPipeline();
 * pipe.add('gray', src => {
 *   const dst = new cv.Mat();
 *   cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
 *   return dst;
 * });
 * pipe.run(src);
 */

class OpenCVPipeline {
  constructor() {
    this.steps = [];
  }

  add(name, processor, description = '') {
    this.steps.push({
      name,
      processor,
      description
    });
    return this;
  }

  remove(index) {
    this.steps.splice(index, 1);
  }

  clear() {
    this.steps = [];
  }

  list() {
    return this.steps.map(step => ({
      name: step.name,
      description: step.description
    }));
  }

  run(input) {
    let current = input;
    const history = [];

    for (const step of this.steps) {
      const next = step.processor(current);

      history.push({
        name: step.name,
        image: next
      });

      if (current !== input) {
        current.delete?.();
      }

      current = next;
    }

    return {
      result: current,
      history
    };
  }
}

window.OpenCVPipeline = OpenCVPipeline;

window.OpenCVPipelinePresets = {
  basicLineDetection() {
    return new OpenCVPipeline()
      .add('灰度化', src => {
        const dst = new cv.Mat();
        cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
        return dst;
      }, '转换到单通道灰度图')
      .add('高斯滤波', src => {
        const dst = new cv.Mat();
        cv.GaussianBlur(src, dst, new cv.Size(5, 5), 0);
        return dst;
      }, '降低噪声')
      .add('二值化', src => {
        const dst = new cv.Mat();
        cv.threshold(src, dst, 120, 255, cv.THRESH_BINARY);
        return dst;
      }, '提取目标区域');
  }
};
