/*
 * OpenCV Learning Lab - Pipeline Mode Engine
 *
 * A small UI-agnostic ordered processor engine. The browser build exposes
 * window.OpenCVPipeline; Node.js receives CommonJS exports for tests.
 */
(function attachPipelineEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.OpenCVPipeline = api.OpenCVPipeline;
    root.OpenCVPipelineExecution = api.OpenCVPipelineExecution;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPipelineEngine() {
  'use strict';

  const SERIALIZATION_VERSION = 1;
  let nextStepId = 1;

  function reserveStepId(id) {
    const match = /^step-(\d+)$/.exec(String(id || ''));
    if (match) nextStepId = Math.max(nextStepId, Number(match[1]) + 1);
  }

  function createStepId(existingSteps) {
    let id;
    do {
      id = `step-${nextStepId++}`;
    } while (existingSteps.some(step => step.id === id));
    return id;
  }

  function clonePlain(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function safeDelete(value) {
    if (value && typeof value.delete === 'function') value.delete();
  }

  function cloneMatrix(value) {
    if (!value || typeof value.clone !== 'function') {
      throw new TypeError('流水线输入与步骤输出必须提供 clone()。');
    }
    return value.clone();
  }

  class OpenCVPipelineExecution {
    constructor(result, history, metadata) {
      this.result = result;
      this.history = history;
      this.metadata = metadata;
      this.disposed = false;
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      safeDelete(this.result);
      for (const item of this.history) safeDelete(item.image);
    }
  }

  class OpenCVPipeline {
    constructor(options = {}) {
      this.registry = options.registry || {};
      this.steps = [];
    }

    setRegistry(registry) {
      this.registry = registry || {};
      return this;
    }

    definition(type) {
      const definition = this.registry[type];
      if (!definition || typeof definition.process !== 'function') {
        throw new Error(`未知流水线步骤：${type}`);
      }
      return definition;
    }

    add(type, params = {}, options = {}) {
      const definition = this.definition(type);
      const defaults = clonePlain(definition.defaults || {});
      const id = options.id || createStepId(this.steps);
      if (this.get(id)) throw new Error(`流水线步骤 ID 重复：${id}`);
      reserveStepId(id);
      const step = {
        id,
        type,
        label: options.label || definition.label || type,
        enabled: options.enabled !== false,
        params: Object.assign(defaults, clonePlain(params || {}))
      };
      this.steps.push(step);
      return step;
    }

    get(id) {
      return this.steps.find(step => step.id === id) || null;
    }

    remove(id) {
      const index = this.steps.findIndex(step => step.id === id);
      if (index < 0) return false;
      this.steps.splice(index, 1);
      return true;
    }

    move(id, offset) {
      const index = this.steps.findIndex(step => step.id === id);
      if (index < 0) return false;
      const target = Math.max(0, Math.min(this.steps.length - 1, index + Number(offset || 0)));
      if (target === index) return false;
      const [step] = this.steps.splice(index, 1);
      this.steps.splice(target, 0, step);
      return true;
    }

    update(id, patch) {
      const step = this.get(id);
      if (!step) throw new Error(`找不到流水线步骤：${id}`);
      step.params = Object.assign({}, step.params, clonePlain(patch || {}));
      return step;
    }

    toggle(id, enabled) {
      const step = this.get(id);
      if (!step) throw new Error(`找不到流水线步骤：${id}`);
      step.enabled = Boolean(enabled);
      return step;
    }

    clear() {
      this.steps.length = 0;
      return this;
    }

    list() {
      return this.steps.map(step => ({
        id: step.id,
        type: step.type,
        label: step.label,
        enabled: step.enabled,
        params: clonePlain(step.params)
      }));
    }

    serialize() {
      return {
        version: SERIALIZATION_VERSION,
        steps: this.steps.map(step => ({
          id: step.id,
          type: step.type,
          label: step.label,
          enabled: step.enabled,
          params: clonePlain(step.params)
        }))
      };
    }

    load(payload) {
      const data = typeof payload === 'string' ? JSON.parse(payload) : clonePlain(payload);
      if (!data || data.version !== SERIALIZATION_VERSION || !Array.isArray(data.steps)) {
        throw new Error('流水线文件格式无效或版本不受支持。');
      }

      const restored = [];
      const restoredIds = new Set();
      for (const item of data.steps) {
        if (!item || typeof item.type !== 'string' || item.params === null || typeof item.params !== 'object') {
          throw new Error('流水线步骤格式无效。');
        }
        const definition = this.definition(item.type);
        const id = typeof item.id === 'string' && item.id ? item.id : createStepId(restored);
        if (restoredIds.has(id)) throw new Error(`流水线步骤 ID 重复：${id}`);
        restoredIds.add(id);
        reserveStepId(id);
        restored.push({
          id,
          type: item.type,
          label: typeof item.label === 'string' && item.label ? item.label : (definition.label || item.type),
          enabled: item.enabled !== false,
          params: Object.assign(clonePlain(definition.defaults || {}), clonePlain(item.params))
        });
      }
      this.steps = restored;
      return this;
    }

    run(input, options = {}) {
      const keepHistory = options.keepHistory !== false;
      const context = options.context || {};
      const history = [];
      const startedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      let current = cloneMatrix(input);
      let executedSteps = 0;

      try {
        for (let index = 0; index < this.steps.length; index += 1) {
          const step = this.steps[index];
          if (!step.enabled) continue;

          const definition = this.definition(step.type);
          const stepStartedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
          let next = definition.process(current, clonePlain(step.params), {
            ...context,
            step: {
              id: step.id,
              type: step.type,
              label: step.label,
              enabled: step.enabled,
              params: clonePlain(step.params)
            },
            stepIndex: index,
            definition
          });

          if (!next || typeof next.clone !== 'function') {
            safeDelete(next);
            throw new TypeError(`步骤“${step.label}”没有返回有效矩阵。`);
          }

          const stepFinishedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
          if (keepHistory) {
            let preview = null;
            try {
              preview = cloneMatrix(next);
            } catch (error) {
              if (next !== current) safeDelete(next);
              throw error;
            }
            history.push({
              id: step.id,
              type: step.type,
              label: step.label,
              params: clonePlain(step.params),
              elapsedMs: stepFinishedAt - stepStartedAt,
              image: preview
            });
          }

          if (next !== current) safeDelete(current);
          current = next;
          next = null;
          executedSteps += 1;
        }

        const finishedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        return new OpenCVPipelineExecution(current, history, {
          elapsedMs: finishedAt - startedAt,
          enabledSteps: executedSteps
        });
      } catch (error) {
        safeDelete(current);
        for (const item of history) safeDelete(item.image);
        throw error;
      }
    }
  }

  return {
    OpenCVPipeline,
    OpenCVPipelineExecution,
    SERIALIZATION_VERSION
  };
});
