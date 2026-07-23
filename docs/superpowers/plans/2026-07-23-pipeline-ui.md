# OpenCV Pipeline UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete offline pipeline editor with ordered OpenCV steps, parameter editing, intermediate previews, presets, serialization, and code/result export.

**Architecture:** Keep the generic ordered-pipeline engine in `pipeline-mode.js`; keep OpenCV-specific processors in `pipeline-operations.js`, editor behavior in `pipeline-editor.js`, and runtime/DOM behavior in `pipeline-app.js`; expose the feature through a dedicated `pipeline.html` entry so the existing single-step lab remains stable. Tests use Node's built-in runner and fake matrices, so development checks do not need the OpenCV runtime.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, OpenCV.js 4.6.0, Node.js built-in `node:test`.

## Global Constraints

- No network requests, CDN dependencies, frontend frameworks, or build step.
- Preserve current `index.html` behavior.
- Every owned `cv.Mat`, `cv.MatVector`, and kernel must be explicitly released.
- Support exactly six first-release operations: grayscale, gaussian, threshold, canny, morphology, contours.
- Keep pipeline JSON at format version `1`.
- Run `npm run check` before publishing.

---

### Task 1: Generic pipeline engine

**Files:**
- Modify: `pipeline-mode.js`
- Test: `tests/pipeline-mode.test.js`

**Interfaces:**
- Consumes: a registry shaped as `{ [type]: { label, defaults, process(input, params, runtime) } }`
- Produces: `new OpenCVPipeline({ registry })`
- Produces: `add(type, params?, options?)`, `get(id)`, `remove(id)`, `move(id, offset)`, `update(id, patch)`, `toggle(id, enabled)`, `clear()`, `list()`, `serialize()`, `load(payload)`, `run(input, options?)`
- Produces: `OpenCVPipelineExecution` with `result`, `history`, `metadata`, and idempotent `dispose()`

- [x] **Step 1: Write the failing engine tests**

```js
const pipeline = new OpenCVPipeline({ registry });
pipeline.add('add', { amount: 2 });
pipeline.add('multiply', { factor: 5 });
const execution = pipeline.run(new FakeMat(3), { keepHistory: true });
assert.equal(execution.result.value, 25);
assert.deepEqual(execution.history.map(item => item.image.value), [5, 25]);
```

- [x] **Step 2: Run the focused tests and verify the old engine fails**

```bash
node --test tests/pipeline-mode.test.js
```

Expected before implementation: failure because the old file assumes `window`, has no registry step model, and cannot serialize or safely expose history.

- [x] **Step 3: Implement the serializable step model**

Each stored step has this exact shape:

```js
{
  id: 'step-1',
  type: 'gaussian',
  label: '高斯模糊',
  enabled: true,
  params: { kernel: 5, sigma: 0 }
}
```

Default parameters and all returned public objects are deep-cloned so one step cannot mutate another step's defaults.

- [x] **Step 4: Implement ordered execution and ownership rules**

```text
caller input (not owned)
  -> engine clone (owned)
  -> processor output (owned)
  -> optional history clone (owned)
  -> final result (owned by execution)
```

On each successful transition, release the previous working matrix. On any exception, release the current matrix and all history clones. `execution.dispose()` releases the final result and history and is safe to call more than once.

- [x] **Step 5: Protect imported step identity**

Imported IDs are checked for duplicates and numeric `step-N` IDs advance the generator, so adding a node after JSON import cannot reuse an existing ID.

- [x] **Step 6: Run the engine tests**

```bash
node --test tests/pipeline-mode.test.js
```

Expected: all engine tests pass with zero failures.

---

### Task 2: Offline pipeline page and OpenCV processors

**Files:**
- Create: `pipeline.html`
- Create: `pipeline.css`
- Create: `pipeline-stage.css`
- Create: `pipeline-operations.js`
- Create: `pipeline-editor.js`
- Create: `pipeline-app.js`
- Test: `tests/pipeline-page.test.js`

**Interfaces:**
- Consumes: `window.OpenCVPipeline`
- Consumes: project-local `opencv.js`
- Produces DOM IDs: `fileInput`, `sampleButton`, `operationPalette`, `pipelineList`, `parameterEditor`, `sourceCanvas`, `resultCanvas`, `previewGrid`, `exportCode`
- Produces registry entries: `grayscale`, `gaussian`, `threshold`, `canny`, `morphology`, `contours`
- Produces presets: `lineTracking`, `edgeDetection`, `binaryCleanup`

- [x] **Step 1: Write failing page structure tests**

```js
for (const id of ['operationPalette', 'pipelineList', 'parameterEditor', 'previewGrid']) {
  assert.match(html, new RegExp(`id=["']${id}["']`));
}
assert.match(html, /\.\/opencv\.js/);
assert.match(html, /\.\/pipeline-mode\.js/);
assert.match(html, /\.\/pipeline-operations\.js/);
assert.match(html, /\.\/pipeline-editor\.js/);
assert.match(html, /\.\/pipeline-app\.js/);
```

- [x] **Step 2: Run the page tests and verify missing-file failures**

```bash
node --test tests/pipeline-page.test.js
```

Expected before implementation: `ENOENT` for `pipeline.html` and `pipeline-app.js`.

- [x] **Step 3: Build the responsive offline editor**

The page has three functional regions:

1. Builder: image input, presets, operation palette, ordered step list, JSON import/export.
2. Stage: source image, final output, run metrics, all intermediate previews.
3. Inspector: selected-step parameters and generated OpenCV.js code.

The page loads `pipeline.css` followed by `pipeline-stage.css`, then scripts in this order:

```html
<script src="./opencv.js"></script>
<script src="./pipeline-mode.js"></script>
<script src="./pipeline-operations.js"></script>
<script src="./pipeline-editor.js"></script>
<script src="./pipeline-app.js"></script>
```

- [x] **Step 4: Implement the six processors with explicit cleanup**

Each processor returns a new matrix and deletes all internal temporaries in `finally` or error branches. Grayscale conversion helpers accept 1-, 3-, and 4-channel matrices. Threshold, Canny, and contour nodes normalize their input to grayscale; contour output is converted to RGBA before drawing.

- [x] **Step 5: Implement editor behavior**

- Add, select, remove, enable/disable, move up, and move down.
- Render controls from registry metadata.
- Debounce automatic re-runs after parameter changes.
- Draw every enabled-step history matrix before disposing the execution.
- Preserve the elapsed-time or failure badge when processing ends.
- Limit imported images to a longest edge of 1800 pixels.

- [x] **Step 6: Implement exports and presets**

- PNG result download.
- JSON version-1 serialization and import.
- Generated OpenCV.js code and clipboard copy.
- Three presets covering line tracking, edges, and binary cleanup.

- [x] **Step 7: Run syntax and page checks**

```bash
node --check pipeline-app.js
node --test tests/pipeline-page.test.js
```

Expected: syntax exit code `0`; all page tests pass.

---

### Task 3: Documentation and release checks

**Files:**
- Modify: `README.txt`
- Modify: `PIPELINE_MODE.md`
- Create: `package.json`
- Create: `docs/superpowers/specs/2026-07-23-pipeline-ui-design.md`
- Create: `docs/superpowers/plans/2026-07-23-pipeline-ui.md`

- [x] **Step 1: Document both offline entry points**

`README.txt` distinguishes `index.html` single-step mode from `pipeline.html` pipeline mode, lists required co-located files, describes the six nodes, presets, exports, memory behavior, troubleshooting, and test commands.

- [x] **Step 2: Document architecture and JSON ownership rules**

`PIPELINE_MODE.md` records the engine API, version-1 schema, data flow, matrix ownership, completed features, test coverage, and intentionally deferred DAG/video/export work.

- [x] **Step 3: Add dependency-free checks**

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "check": "node --check pipeline-mode.js && node --check pipeline-operations.js && node --check pipeline-editor.js && node --check pipeline-app.js && npm test"
  }
}
```

- [x] **Step 4: Run the complete verification suite**

```bash
npm run check
```

Expected: JavaScript syntax checks succeed and all tests report zero failures.

- [ ] **Step 5: Publish and create a pull request**

Create branch `agent/pipeline-ui` from current `main`, upload only the files listed in this plan, compare the branch with `main`, and open a ready-for-review pull request titled `feat: add interactive OpenCV pipeline editor`.
