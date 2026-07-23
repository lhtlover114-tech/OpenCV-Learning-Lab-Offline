'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

test('pipeline page exposes the offline editor entry points', () => {
  const html = read('pipeline.html');

  for (const id of [
    'fileInput',
    'sampleButton',
    'operationPalette',
    'pipelineList',
    'parameterEditor',
    'sourceCanvas',
    'resultCanvas',
    'previewGrid',
    'exportCode'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(html, /\.\/opencv\.js/);
  assert.match(html, /\.\/pipeline-mode\.js/);
  assert.match(html, /\.\/pipeline-operations\.js/);
  assert.match(html, /\.\/pipeline-editor\.js/);
  assert.match(html, /\.\/pipeline-app\.js/);
  assert.match(html, /\.\/pipeline\.css/);
  assert.match(html, /\.\/pipeline-stage\.css/);
});

test('pipeline app registers all first-release operations and presets', () => {
  const script = read('pipeline-operations.js');

  for (const operation of ['grayscale', 'gaussian', 'threshold', 'canny', 'morphology', 'contours']) {
    assert.match(script, new RegExp(`${operation}:\\s*\\{`));
  }

  for (const preset of ['lineTracking', 'edgeDetection', 'binaryCleanup']) {
    assert.match(script, new RegExp(`${preset}:\\s*\\[`));
  }
});

test('pipeline page has unique ids, complete DOM references and deterministic script order', () => {
  const html = read('pipeline.html');
  const script = [read('pipeline-operations.js'), read('pipeline-editor.js'), read('pipeline-app.js')].join('\n');
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const referencedIds = [...script.matchAll(/\$\('#([^']+)'\)/g)].map(match => match[1]);
  const sources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(match => match[1]);

  assert.deepEqual(duplicateIds, []);
  assert.deepEqual(sources, ['./opencv.js', './pipeline-mode.js', './pipeline-operations.js', './pipeline-editor.js', './pipeline-app.js']);
  assert.deepEqual(referencedIds.filter(id => !ids.includes(id)), []);
  assert.match(html, /href=["']\.\/index\.html["']/);
});

test('documentation describes both offline entry points and versioned pipeline files', () => {
  const readme = read('README.txt');
  const pipelineDoc = read('PIPELINE_MODE.md');

  assert.match(readme, /index\.html：单步实验模式/);
  assert.match(readme, /pipeline\.html：流水线模式/);
  assert.match(readme, /npm run check/);
  assert.match(pipelineDoc, /格式版本为 `1`/);
  assert.match(pipelineDoc, /execution\.dispose\(\)/);
  assert.match(readme, /pipeline-stage\.css/);
});
