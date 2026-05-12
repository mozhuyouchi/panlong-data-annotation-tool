document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  bindEvents();
  state.db = await openDb();
  await loadPersistedState();
  renderProjectSummary();
  renderAnnotatorOptions();
  syncSelectionToView();
  renderTaskList();
  renderWorkspace();
  setSaveIndicator('已加载');
  applyRegionZoomStyles();
  applyImageZoomStyle();
  setActiveRegion(state.activeRegionId);
}

function cacheElements() {
  [
    'project-name', 'book-count', 'task-count',
    'annotator-select', 'current-annotator-name', 'current-task-name', 'save-indicator',
    'task-list', 'folder-file-count', 'folder-status', 'folder-summary',
    'workspace-empty', 'workspace-content', 'workspace-book-name', 'workspace-copy-name',
    'workspace-page-label', 'workspace-mode-label', 'task-range-text', 'unit-order-text',
    'task-progress-text', 'task-progress-fill', 'current-filename', 'info-size',
    'template-status-text', 'template-help-text', 'template-offset-controls',
    'offset-x-input', 'offset-y-input', 'page-status-buttons', 'annotations-list',
    'current-task-name', 'current-annotator-name', 'image-placeholder', 'image-container',
    'main-image', 'drawing-box', 'phase-hint', 'phase-hint-text'
  ].forEach(id => {
    elements[toCamel(id)] = document.getElementById(id);
  });

  elements.configInput = document.getElementById('config-input');
  elements.folderInput = document.getElementById('folder-input');
  elements.enterWorkbenchBtn = document.getElementById('enter-workbench-btn');
  elements.downloadConfigTemplateBtn = document.getElementById('download-config-template-btn');
  elements.prevUnitBtn = document.getElementById('prev-unit-btn');
  elements.nextUnitBtn = document.getElementById('next-unit-btn');
  elements.markCompleteBtn = document.getElementById('mark-complete-btn');
  elements.redrawTemplateBtn = document.getElementById('redraw-template-btn');
  elements.redrawCurrentPageBtn = document.getElementById('redraw-current-page-btn');
  elements.exportTaskJsonBtn = document.getElementById('export-task-json-btn');
  elements.exportTemplateJsonlBtn = document.getElementById('export-template-jsonl-btn');
  elements.exportAttemptJsonlBtn = document.getElementById('export-attempt-jsonl-btn');
  elements.questionTypeButtons = Array.from(document.querySelectorAll('#question-type-buttons .type-btn'));
  elements.imagePanel = document.getElementById('image-panel');
  elements.imageZoomStage = document.getElementById('image-zoom-stage');
  elements.panelRegions = Array.from(document.querySelectorAll('.panel-region'));
}

function bindEvents() {
  elements.configInput.addEventListener('change', handleConfigImport);
  elements.folderInput.addEventListener('change', handleFolderImport);
  elements.annotatorSelect.addEventListener('change', () => {
    state.annotatorId = elements.annotatorSelect.value;
    localStorage.setItem(STORAGE_KEYS.annotatorId, state.annotatorId);
    renderTaskList();
    syncSelectionToView();
  });
  elements.enterWorkbenchBtn.addEventListener('click', () => {
    if (!state.annotatorId) {
      alert('请先选择标注员。');
      return;
    }
    renderTaskList();
  });
  elements.downloadConfigTemplateBtn.addEventListener('click', () => {
    downloadTextFile('project-config.sample.json', DEFAULT_PROJECT_CONFIG_TEXT, 'application/json');
  });
  elements.prevUnitBtn.addEventListener('click', () => stepTaskUnit(-1));
  elements.nextUnitBtn.addEventListener('click', () => stepTaskUnit(1));
  elements.markCompleteBtn.addEventListener('click', () => {
    const attempt = getCurrentAttempt();
    if (!attempt) return;
    attempt.pageStatus = 'completed';
    attempt.updatedAt = new Date().toISOString();
    autoSaveWorkbench();
    renderWorkspace();
  });
  elements.redrawTemplateBtn.addEventListener('click', handleRedrawTemplate);
  elements.redrawCurrentPageBtn.addEventListener('click', handleRedrawCurrentPage);
  elements.exportTaskJsonBtn.addEventListener('click', exportTaskJsonPackage);
  elements.exportTemplateJsonlBtn.addEventListener('click', exportTemplateJsonl);
  elements.exportAttemptJsonlBtn.addEventListener('click', exportAttemptJsonl);
  elements.offsetXInput.addEventListener('input', handleOffsetChange);
  elements.offsetYInput.addEventListener('input', handleOffsetChange);
  elements.questionTypeButtons.forEach(btn => {
    btn.addEventListener('click', () => setCurrentType(btn.dataset.type));
  });

  const imageContainer = elements.imageContainer;
  imageContainer.addEventListener('mousedown', handleDrawStart);
  document.addEventListener('mousemove', handleDrawMove);
  document.addEventListener('mouseup', handleDrawEnd);
  window.addEventListener('resize', updateDisplaySize);
  elements.panelRegions.forEach(region => {
    region.addEventListener('pointerdown', () => setActiveRegion(region.id));
    region.addEventListener('focus', () => setActiveRegion(region.id));
    region.addEventListener('wheel', event => handleRegionWheel(event, region), { passive: false });
  });
}

async function loadPersistedState() {
  const savedProject = localStorage.getItem(STORAGE_KEYS.projectConfig);
  if (savedProject) {
    try {
      state.project = JSON.parse(savedProject);
    } catch (error) {
      console.warn('项目配置解析失败，回退到默认配置。', error);
    }
  }

  state.annotatorId = localStorage.getItem(STORAGE_KEYS.annotatorId) || '';
  state.activeTaskId = localStorage.getItem(STORAGE_KEYS.activeTaskId) || '';

  const workbench = await dbGet('workbench');
  if (workbench) {
    state.workbench = workbench;
  }
}

function handleConfigImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(loadEvent) {
    try {
      const parsed = JSON.parse(loadEvent.target.result);
      validateProjectConfig(parsed);
      state.project = parsed;
      localStorage.setItem(STORAGE_KEYS.projectConfig, JSON.stringify(parsed));
      state.activeTaskId = '';
      state.annotatorId = '';
      renderProjectSummary();
      renderAnnotatorOptions();
      renderTaskList();
      renderWorkspace();
      syncSelectionToView();
      setSaveIndicator('已导入配置');
    } catch (error) {
      alert(`配置文件解析失败：${error.message}`);
    }
  };
  reader.readAsText(file, 'utf-8');
  event.target.value = '';
}

function handleFolderImport(event) {
  const files = Array.from(event.target.files || []);
  state.fileRecords = files.map(file => ({
    file,
    relativePath: (file.webkitRelativePath || file.name).replace(/\\/g, '/')
  }));
  elements.folderFileCount.textContent = String(state.fileRecords.length);
  elements.folderStatus.textContent = state.fileRecords.length ? '已读取' : '未选择';
  elements.folderSummary.textContent = state.fileRecords.length
    ? `已读取 ${state.fileRecords.length} 个文件，当前会根据任务中的书本、页码和副本自动定位图片。`
    : '请选择整本书所在的根目录。';
  renderWorkspace();
}

function handleOffsetChange() {
  const attempt = getCurrentAttempt();
  if (!attempt) return;
  attempt.templateOffset = {
    x: Number(elements.offsetXInput.value || 0),
    y: Number(elements.offsetYInput.value || 0)
  };
  touchCurrentAttempt();
  renderAnnotationBoxes();
}

function handleRedrawTemplate() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  if (!task || !unit) return;
  if (!confirm('确认重做当前页模板？该页所有副本对模板的复用都会失效，需要重新建立。')) return;

  delete state.workbench.templates[buildTemplateKey(task.bookId, unit.pageNo)];
  const affectedAttempts = Object.keys(state.workbench.attempts).filter(key => key.startsWith(`${task.bookId}__${unit.pageNo}__`));
  affectedAttempts.forEach(key => delete state.workbench.attempts[key]);
  touchWorkbench();
  renderWorkspace();
}

function handleRedrawCurrentPage() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  if (!task || !unit) return;
  if (!confirm('确认仅重标当前页吗？这会清空当前页的全部标注内容，并改为独立重标，但不会影响共享模板和其他副本。')) return;

  const attemptKey = buildAttemptKey(task.bookId, task.id, unit.copyId, unit.pageNo);
  state.workbench.attempts[attemptKey] = createDetachedAttempt(task, unit);
  state.selectedQuestionId = null;
  state.pendingQuestion = null;
  state.pendingSubQuestion = null;
  state.pendingSubQuestionParentId = null;
  state.pendingAnswerTarget = null;
  setDrawingPhase(null);
  touchWorkbench();
  renderWorkspace();
}
