'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenCVPipeline } = require('../pipeline-mode.js');

class FakeMat {
  constructor(value) {
    this.value = value;
    this.deleted = false;
  }

  clone() {
    return new FakeMat(this.value);
  }

  delete() {
    this.deleted = true;
  }
}

const registry = {
  add: {
    label: '加法',
    defaults: { amount: 1 },
    process(input, params) {
      return new FakeMat(input.value + params.amount);
    }
  },
  multiply: {
    label: '乘法',
    defaults: { factor: 2 },
    process(input, params) {
      return new FakeMat(input.value * params.factor);
    }
  }
};

test('add creates a serializable step with isolated default parameters', () => {
  const pipeline = new OpenCVPipeline({ registry });

  const first = pipeline.add('add');
  const second = pipeline.add('add');
  first.params.amount = 9;

  assert.match(first.id, /^step-/);
  assert.notEqual(first.id, second.id);
  assert.equal(second.params.amount, 1);
  assert.deepEqual(pipeline.list(), [
    { id: first.id, type: 'add', label: '加法', enabled: true, params: { amount: 9 } },
    { id: second.id, type: 'add', label: '加法', enabled: true, params: { amount: 1 } }
  ]);
});

test('move, update, toggle and remove mutate only the selected step', () => {
  const pipeline = new OpenCVPipeline({ registry });
  const add = pipeline.add('add');
  const multiply = pipeline.add('multiply');

  pipeline.update(add.id, { amount: 3 });
  pipeline.toggle(multiply.id, false);
  pipeline.move(multiply.id, -1);
  pipeline.remove(add.id);

  assert.deepEqual(pipeline.list(), [
    { id: multiply.id, type: 'multiply', label: '乘法', enabled: false, params: { factor: 2 } }
  ]);
});

test('serialize and load round-trip while rejecting unknown operation types', () => {
  const pipeline = new OpenCVPipeline({ registry });
  pipeline.add('add', { amount: 4 });
  pipeline.add('multiply', { factor: 3 }, { enabled: false });

  const serialized = pipeline.serialize();
  const restored = new OpenCVPipeline({ registry });
  restored.load(serialized);

  assert.deepEqual(restored.serialize(), serialized);
  assert.throws(
    () => restored.load({ version: 1, steps: [{ type: 'missing', params: {} }] }),
    /未知流水线步骤/
  );
});

test('run executes enabled steps in order and keeps independent preview images', () => {
  const pipeline = new OpenCVPipeline({ registry });
  pipeline.add('add', { amount: 2 });
  pipeline.add('multiply', { factor: 5 });
  pipeline.add('add', { amount: 100 }, { enabled: false });
  const input = new FakeMat(3);

  const execution = pipeline.run(input, { keepHistory: true });

  assert.equal(input.value, 3);
  assert.equal(input.deleted, false);
  assert.equal(execution.result.value, 25);
  assert.deepEqual(execution.history.map(item => item.image.value), [5, 25]);
  assert.notEqual(execution.history[1].image, execution.result);
  execution.dispose();
  assert.equal(execution.result.deleted, true);
  assert.equal(execution.history[0].image.deleted, true);
  assert.equal(execution.history[1].image.deleted, true);
});

test('run releases owned matrices when a processor throws', () => {
  const owned = [];
  const failingRegistry = {
    ok: {
      label: '正常',
      defaults: {},
      process(input) {
        const output = new FakeMat(input.value + 1);
        owned.push(output);
        return output;
      }
    },
    fail: {
      label: '失败',
      defaults: {},
      process() {
        throw new Error('boom');
      }
    }
  };
  const pipeline = new OpenCVPipeline({ registry: failingRegistry });
  pipeline.add('ok');
  pipeline.add('fail');

  assert.throws(() => pipeline.run(new FakeMat(1)), /boom/);
  assert.equal(owned[0].deleted, true);
});

test('load reserves restored step ids so later additions stay unique', () => {
  const pipeline = new OpenCVPipeline({ registry });
  const probe = pipeline.add('add');
  const nextNumber = Number(probe.id.replace('step-', '')) + 1;
  const restoredId = `step-${nextNumber}`;
  pipeline.load({
    version: 1,
    steps: [{ id: restoredId, type: 'add', label: '已导入', enabled: true, params: { amount: 2 } }]
  });

  const added = pipeline.add('multiply');

  assert.notEqual(added.id, restoredId);
  assert.equal(new Set(pipeline.list().map(step => step.id)).size, 2);
});

test('load rejects duplicate step ids', () => {
  const pipeline = new OpenCVPipeline({ registry });

  assert.throws(
    () => pipeline.load({
      version: 1,
      steps: [
        { id: 'step-200', type: 'add', label: '一', enabled: true, params: { amount: 1 } },
        { id: 'step-200', type: 'multiply', label: '二', enabled: true, params: { factor: 2 } }
      ]
    }),
    /ID 重复/
  );
});

test('run counts enabled steps even when history is disabled', () => {
  const pipeline = new OpenCVPipeline({ registry });
  pipeline.add('add', { amount: 2 });
  pipeline.add('multiply', { factor: 3 });

  const execution = pipeline.run(new FakeMat(4), { keepHistory: false });

  assert.equal(execution.result.value, 18);
  assert.deepEqual(execution.history, []);
  assert.equal(execution.metadata.enabledSteps, 2);
  execution.dispose();
  execution.dispose();
  assert.equal(execution.disposed, true);
});
