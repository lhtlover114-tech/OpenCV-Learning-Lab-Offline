'use strict';

  function formatNumber(value, digits = 1) {
    return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });
  }

  function sanitizeFileBase(name) {
    return (name || 'opencv-pipeline').replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff-]+/g, '-');
  }

  function showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`.trim();
    toast.textContent = message;
    $('#toastRegion').append(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function showError(message) {
    const banner = $('#errorBanner');
    banner.textContent = message;
    banner.classList.add('visible');
  }

  function clearError() {
    const banner = $('#errorBanner');
    banner.textContent = '';
    banner.classList.remove('visible');
  }

  function setStatus(stateName, text) {
    $('#cvStatus').dataset.state = stateName;
    $('#cvStatusText').textContent = text;
  }

  function setProcessing(active) {
    state.processing = active;
    document.body.dataset.processing = String(active);
    $('#processingOverlay').classList.toggle('visible', active);
    $('#runButton').disabled = active || !state.cvReady || !state.imageLoaded || state.pipeline.steps.length === 0;
    if (active) $('#runBadge').textContent = '正在处理';
  }

  function updateActionStates() {
    $('#runButton').disabled = state.processing || !state.cvReady || !state.imageLoaded || state.pipeline.steps.length === 0;
    $('#downloadButton').disabled = !$('#resultCard').classList.contains('has-image');
    $('#clearPipelineButton').disabled = state.pipeline.steps.length === 0;
  }

  function summarizeParams(step) {
    const values = Object.entries(step.params || {}).slice(0, 2).map(([key, value]) => `${key}=${typeof value === 'boolean' ? (value ? 'on' : 'off') : value}`);
    return values.length ? values.join(' · ') : '无参数';
  }

  function renderOperationPalette() {
    const palette = $('#operationPalette');
    palette.replaceChildren();
    for (const [type, definition] of Object.entries(OPERATION_REGISTRY)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'palette-button';
      button.dataset.operationType = type;
      button.innerHTML = `<span class="palette-icon">${definition.icon}</span><span class="palette-copy"><strong>${definition.label}</strong><small>${definition.summary}</small></span>`;
      button.addEventListener('click', () => addStep(type));
      palette.append(button);
    }
  }

  function selectStep(id) {
    state.selectedStepId = state.pipeline.get(id) ? id : (state.pipeline.steps[0]?.id || null);
    renderPipelineList();
    renderParameterEditor();
  }

  function addStep(type, params = {}) {
    const step = state.pipeline.add(type, params);
    state.selectedStepId = step.id;
    renderAllEditors();
    scheduleRun();
    showToast(`已添加“${step.label}”。`, 'success');
  }

  function removeStep(id) {
    const steps = state.pipeline.steps;
    const index = steps.findIndex(step => step.id === id);
    if (index < 0) return;
    const label = steps[index].label;
    state.pipeline.remove(id);
    if (state.selectedStepId === id) state.selectedStepId = state.pipeline.steps[Math.min(index, state.pipeline.steps.length - 1)]?.id || null;
    renderAllEditors();
    scheduleRun();
    showToast(`已删除“${label}”。`);
  }

  function moveStep(id, offset) {
    if (!state.pipeline.move(id, offset)) return;
    renderAllEditors();
    scheduleRun();
  }

  function toggleStep(id, enabled) {
    state.pipeline.toggle(id, enabled);
    renderAllEditors();
    scheduleRun();
  }

  function renderPipelineList() {
    const list = $('#pipelineList');
    list.replaceChildren();
    $('#pipelineCount').textContent = `${state.pipeline.steps.length} 个步骤`;

    if (state.pipeline.steps.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pipeline-empty';
      empty.textContent = '从上方添加处理步骤，或应用一个预设。';
      list.append(empty);
      updateActionStates();
      return;
    }

    state.pipeline.steps.forEach((step, index) => {
      const card = document.createElement('div');
      card.className = 'pipeline-step-card';
      card.classList.toggle('selected', step.id === state.selectedStepId);
      card.classList.toggle('disabled', !step.enabled);
      card.tabIndex = 0;
      card.dataset.stepId = step.id;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', String(step.id === state.selectedStepId));
      card.addEventListener('click', () => selectStep(step.id));
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectStep(step.id);
        }
      });

      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.className = 'step-enabled';
      enabled.checked = step.enabled;
      enabled.title = '启用或禁用步骤';
      enabled.addEventListener('click', event => event.stopPropagation());
      enabled.addEventListener('change', event => toggleStep(step.id, event.currentTarget.checked));

      const badge = document.createElement('span');
      badge.className = 'step-index';
      badge.textContent = String(index + 1).padStart(2, '0');

      const copy = document.createElement('span');
      copy.className = 'step-copy';
      const title = document.createElement('strong');
      title.textContent = step.label;
      const summary = document.createElement('small');
      summary.textContent = summarizeParams(step);
      copy.append(title, summary);

      const actions = document.createElement('span');
      actions.className = 'step-actions';
      const actionDefinitions = [
        ['↑', '上移', () => moveStep(step.id, -1), index === 0],
        ['↓', '下移', () => moveStep(step.id, 1), index === state.pipeline.steps.length - 1],
        ['×', '删除', () => removeStep(step.id), false]
      ];
      for (const [text, titleText, handler, disabled] of actionDefinitions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `button icon small${text === '×' ? ' danger' : ''}`;
        button.textContent = text;
        button.title = titleText;
        button.disabled = disabled;
        button.addEventListener('click', event => {
          event.stopPropagation();
          handler();
        });
        actions.append(button);
      }

      card.append(enabled, badge, copy, actions);
      list.append(card);
    });
    updateActionStates();
  }

  function normalizeStepParams(step) {
    if (step.type === 'canny') {
      if (Number(step.params.low) >= Number(step.params.high)) step.params.high = Math.min(255, Number(step.params.low) + 1);
      if (Number(step.params.high) <= Number(step.params.low)) step.params.low = Math.max(0, Number(step.params.high) - 1);
    }
  }

  function parseControlValue(control, input) {
    if (control.type === 'checkbox') return input.checked;
    const option = control.type === 'select' ? control.options.find(item => String(item.value) === input.value) : null;
    if (option) return option.value;
    return control.type === 'range' ? Number(input.value) : input.value;
  }

  function renderParameterEditor() {
    const editor = $('#parameterEditor');
    editor.replaceChildren();
    const step = state.pipeline.get(state.selectedStepId);
    if (!step) {
      const empty = document.createElement('div');
      empty.className = 'editor-empty';
      empty.textContent = '选择一个流水线步骤后，这里会显示参数。';
      editor.append(empty);
      return;
    }

    const definition = OPERATION_REGISTRY[step.type];
    const hero = document.createElement('div');
    hero.className = 'editor-hero';
    hero.innerHTML = `<strong>${definition.label}</strong><span>${definition.description}</span>`;
    editor.append(hero);

    const stack = document.createElement('div');
    stack.className = 'controls-stack';
    if (definition.controls.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'editor-empty';
      empty.textContent = '该步骤没有可调参数。';
      stack.append(empty);
    }

    for (const control of definition.controls) {
      if (control.type === 'checkbox') {
        const wrapper = document.createElement('label');
        wrapper.className = 'checkbox-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(step.params[control.key]);
        const copy = document.createElement('span');
        copy.innerHTML = `<strong>${control.label}</strong><span>${control.help || ''}</span>`;
        input.addEventListener('change', () => {
          state.pipeline.update(step.id, { [control.key]: input.checked });
          normalizeStepParams(step);
          renderPipelineList();
          renderExportCode();
          scheduleRun();
        });
        wrapper.append(input, copy);
        stack.append(wrapper);
        continue;
      }

      const group = document.createElement('div');
      group.className = 'control-group';
      const row = document.createElement('div');
      row.className = 'control-label-row';
      const label = document.createElement('label');
      const inputId = `param-${step.id}-${control.key}`;
      label.htmlFor = inputId;
      label.textContent = control.label;
      row.append(label);
      let output = null;
      if (control.type === 'range') {
        output = document.createElement('span');
        output.className = 'control-value';
        output.textContent = String(step.params[control.key]);
        row.append(output);
      }
      group.append(row);

      let input;
      if (control.type === 'select') {
        input = document.createElement('select');
        for (const option of control.options) {
          const item = document.createElement('option');
          item.value = String(option.value);
          item.textContent = option.label;
          item.selected = String(step.params[control.key]) === String(option.value);
          input.append(item);
        }
      } else {
        input = document.createElement('input');
        input.type = 'range';
        input.min = String(control.min);
        input.max = String(control.max);
        input.step = String(control.step);
        input.value = String(step.params[control.key]);
      }
      input.id = inputId;
      input.disabled = Boolean(control.disabledWhen?.(step.params));
      const eventName = control.type === 'range' ? 'input' : 'change';
      input.addEventListener(eventName, () => {
        const value = parseControlValue(control, input);
        state.pipeline.update(step.id, { [control.key]: value });
        normalizeStepParams(step);
        if (output) output.textContent = String(step.params[control.key]);
        if (definition.controls.some(item => item.disabledWhen)) renderParameterEditor();
        renderPipelineList();
        renderExportCode();
        scheduleRun();
      });
      group.append(input);
      if (control.help) {
        const help = document.createElement('p');
        help.className = 'control-help';
        help.textContent = control.help;
        group.append(help);
      }
      stack.append(group);
    }
    editor.append(stack);
  }

  function jsLiteral(value) {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
  }

  function buildStepCode(step, index) {
    const n = index + 1;
    const p = step.params;
    const lines = [`// ${n}. ${step.label}`];
    if (!step.enabled) return [`// ${n}. ${step.label}（已禁用）`];

    if (step.type === 'grayscale') {
      lines.push(`next = toGray(current);`);
    } else if (step.type === 'gaussian') {
      lines.push(`next = new cv.Mat();`);
      lines.push(`cv.GaussianBlur(current, next, new cv.Size(${p.kernel}, ${p.kernel}), ${p.sigma}, 0, cv.BORDER_DEFAULT);`);
    } else if (step.type === 'threshold') {
      const inverse = String(p.mode).endsWith('Inv');
      const otsu = String(p.mode).startsWith('otsu');
      lines.push(`temp = toGray(current);`);
      lines.push(`next = new cv.Mat();`);
      lines.push(`cv.threshold(temp, next, ${otsu ? 0 : p.value}, ${p.maxValue}, ${inverse ? 'cv.THRESH_BINARY_INV' : 'cv.THRESH_BINARY'}${otsu ? ' | cv.THRESH_OTSU' : ''});`);
      lines.push(`temp.delete();`);
    } else if (step.type === 'canny') {
      lines.push(`temp = toGray(current);`);
      if (Number(p.blurKernel) > 1) {
        lines.push(`const blurred${n} = new cv.Mat();`);
        lines.push(`cv.GaussianBlur(temp, blurred${n}, new cv.Size(${p.blurKernel}, ${p.blurKernel}), 0);`);
        lines.push(`temp.delete();`);
        lines.push(`temp = blurred${n};`);
      }
      lines.push(`next = new cv.Mat();`);
      lines.push(`cv.Canny(temp, next, ${p.low}, ${p.high}, ${p.aperture}, ${Boolean(p.l2Gradient)});`);
      lines.push(`temp.delete();`);
    } else if (step.type === 'morphology') {
      const shape = { rect: 'cv.MORPH_RECT', cross: 'cv.MORPH_CROSS', ellipse: 'cv.MORPH_ELLIPSE' }[p.shape];
      const op = { open: 'cv.MORPH_OPEN', close: 'cv.MORPH_CLOSE' }[p.mode];
      lines.push(`const kernel${n} = cv.getStructuringElement(${shape}, new cv.Size(${p.kernel}, ${p.kernel}));`);
      lines.push(`next = new cv.Mat();`);
      if (p.mode === 'erode') lines.push(`cv.erode(current, next, kernel${n}, new cv.Point(-1, -1), ${p.iterations});`);
      else if (p.mode === 'dilate') lines.push(`cv.dilate(current, next, kernel${n}, new cv.Point(-1, -1), ${p.iterations});`);
      else lines.push(`cv.morphologyEx(current, next, ${op}, kernel${n}, new cv.Point(-1, -1), ${p.iterations});`);
      lines.push(`kernel${n}.delete();`);
    } else if (step.type === 'contours') {
      const retrieval = { external: 'cv.RETR_EXTERNAL', list: 'cv.RETR_LIST', tree: 'cv.RETR_TREE' }[p.retrieval];
      lines.push(`temp = toGray(current);`);
      lines.push(`const binary${n} = new cv.Mat();`);
      lines.push(`cv.threshold(temp, binary${n}, ${p.threshold}, 255, ${p.invert ? 'cv.THRESH_BINARY_INV' : 'cv.THRESH_BINARY'});`);
      lines.push(`const contours${n} = new cv.MatVector();`);
      lines.push(`const hierarchy${n} = new cv.Mat();`);
      lines.push(`cv.findContours(binary${n}, contours${n}, hierarchy${n}, ${retrieval}, cv.CHAIN_APPROX_SIMPLE);`);
      lines.push(`next = toRgba(current);`);
      lines.push(`for (let i = 0; i < contours${n}.size(); i += 1) {`);
      lines.push(`  const contour = contours${n}.get(i);`);
      lines.push(`  if (cv.contourArea(contour) >= ${p.minArea}) {`);
      lines.push(`    cv.drawContours(next, contours${n}, i, new cv.Scalar(15, 118, 110, 255), ${p.lineWidth});`);
      if (p.drawBoxes) lines.push(`    const r = cv.boundingRect(contour); cv.rectangle(next, new cv.Point(r.x, r.y), new cv.Point(r.x + r.width, r.y + r.height), new cv.Scalar(37, 99, 235, 255), ${p.lineWidth});`);
      lines.push(`  }`);
      lines.push(`  contour.delete();`);
      lines.push(`}`);
      lines.push(`temp.delete(); binary${n}.delete(); contours${n}.delete(); hierarchy${n}.delete();`);
    }
    lines.push(`current.delete();`);
    lines.push(`current = next;`);
    return lines;
  }

  function generateExportCode() {
    const helpers = `function toGray(src) {
  if (src.channels() === 1) return src.clone();
  const dst = new cv.Mat();
  cv.cvtColor(src, dst, src.channels() === 4 ? cv.COLOR_RGBA2GRAY : cv.COLOR_RGB2GRAY);
  return dst;
}

function toRgba(src) {
  if (src.channels() === 4) return src.clone();
  const dst = new cv.Mat();
  cv.cvtColor(src, dst, src.channels() === 1 ? cv.COLOR_GRAY2RGBA : cv.COLOR_RGB2RGBA);
  return dst;
}`;
    const body = state.pipeline.steps.flatMap((step, index) => buildStepCode(step, index)).map(line => `  ${line}`).join('\n\n');
    return `${helpers}

let current = cv.imread('sourceCanvas');
let next;
let temp;

try {
${body || '  // 添加流水线步骤后，这里会生成代码。'}
  cv.imshow('resultCanvas', current);
} finally {
  current.delete();
}`;
  }

  function renderExportCode() {
    $('#exportCode').textContent = generateExportCode();
  }

  function renderAllEditors() {
    renderPipelineList();
    renderParameterEditor();
    renderExportCode();
  }

  function applyPreset(name, notify = true) {
    const preset = PRESETS[name];
    if (!preset) return;
    state.pipeline.clear();
    for (const item of preset) state.pipeline.add(item.type, item.params || {}, item.options || {});
    state.selectedStepId = state.pipeline.steps[0]?.id || null;
    renderAllEditors();
    clearRenderedResult();
    scheduleRun(true);
    if (notify) showToast(`已应用“${$('#presetSelect').selectedOptions[0]?.textContent || name}”预设。`, 'success');
  }

  function clearRenderedResult() {
    state.execution?.dispose();
    state.execution = null;
    $('#resultCard').classList.remove('has-image');
    const resultCanvas = $('#resultCanvas');
    const context = resultCanvas.getContext('2d');
    context.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultCanvas.width = 0;
    resultCanvas.height = 0;
    $('#resultMeta').textContent = 'resultCanvas';
    $('#resultBadge').textContent = '输出 —';
    $('#previewGrid').replaceChildren();
    renderPreviewEmpty();
    $('#previewCount').textContent = '0 张';
    $('#metricTime').textContent = '—';
    $('#metricSteps').textContent = '—';
    $('#metricShape').textContent = '—';
    $('#metricContours').textContent = '—';
    $('#runBadge').textContent = state.imageLoaded ? '等待运行' : '等待图片';
    updateActionStates();
  }
