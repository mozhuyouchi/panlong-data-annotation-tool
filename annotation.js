document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  bindEvents();
  state.db = await openDb();
  await loadPersistedState();

  var reachable = await apiClient.init();
  if (reachable) {
    var serverData = await apiClient.fetchAll();
    if (serverData) {
      mergeServerData(serverData);
    }
  }

  renderProjectSummary();
  renderAnnotatorOptions();
  syncSelectionToView();
  renderTaskList();
  renderWorkspace();
  setSaveIndicator(reachable ? '已同步服务器数据' : '已加载(离线模式)');
  applyRegionZoomStyles();
  applyImageZoomStyle();
  setActiveRegion(state.activeRegionId);

  document.body.classList.add('app-ready');
}

function mergeServerData(serverData) {
  if (serverData.project_config) {
    state.project = serverData.project_config;
    localStorage.setItem(STORAGE_KEYS.projectConfig, JSON.stringify(serverData.project_config));
  }

  if (serverData.templates) {
    Object.entries(serverData.templates).forEach(([key, serverTmpl]) => {
      const localTmpl = state.workbench.templates[key];
      if (!localTmpl || (serverTmpl.createdAt || '') >= (localTmpl.createdAt || '')) {
        state.workbench.templates[key] = serverTmpl;
      }
    });
  }

  if (serverData.attempts) {
    Object.entries(serverData.attempts).forEach(([key, serverAtt]) => {
      const localAtt = state.workbench.attempts[key];
      if (!localAtt || (serverAtt.updatedAt || '') >= (localAtt.updatedAt || '')) {
        state.workbench.attempts[key] = serverAtt;
      }
    });
  }

  if (serverData.cursors) {
    const currentTask = getCurrentTask();
    Object.entries(serverData.cursors).forEach(([taskId, cursor]) => {
      if (!currentTask || taskId !== currentTask.id) {
        state.workbench.taskCursor[taskId] = cursor;
      }
    });
  }

  dbSet('workbench', state.workbench);

  autoSelectAnnotatorAndTask();
}

function autoSelectAnnotatorAndTask() {
  var annotators = state.project.annotators || [];
  var tasks = state.project.tasks || [];

  if (!state.annotatorId || !annotators.find(function (a) { return a.id === state.annotatorId; })) {
    state.annotatorId = annotators.length ? annotators[0].id : '';
    localStorage.setItem(STORAGE_KEYS.annotatorId, state.annotatorId);
  }

  if (!state.activeTaskId) {
    var myTasks = tasks.filter(function (t) { return t.annotatorId === state.annotatorId; });
    if (myTasks.length) {
      state.activeTaskId = myTasks[0].id;
      localStorage.setItem(STORAGE_KEYS.activeTaskId, myTasks[0].id);
    }
  }
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
    'main-image', 'drawing-box', 'phase-hint', 'phase-hint-text',
    'page-map-section', 'page-map-logical', 'page-map-copy', 'page-map-image',
    'page-map-input'
  ].forEach(id => {
    elements[toCamel(id)] = document.getElementById(id);
  });

  elements.configInput = document.getElementById('config-input');
  elements.folderInput = document.getElementById('folder-input');
  elements.enterWorkbenchBtn = document.getElementById('enter-workbench-btn');
  elements.prevUnitBtn = document.getElementById('prev-unit-btn');
  elements.nextUnitBtn = document.getElementById('next-unit-btn');
  elements.markCompleteBtn = document.getElementById('mark-complete-btn');
  elements.redrawTemplateBtn = document.getElementById('redraw-template-btn');
  elements.redrawCurrentPageBtn = document.getElementById('redraw-current-page-btn');
  elements.exportTaskJsonBtn = document.getElementById('export-task-json-btn');
  elements.applyPageMapBtn = document.getElementById('apply-page-map-btn');
  elements.skipLogicalPageBtn = document.getElementById('skip-logical-page-btn');
  elements.jumpPageInput = document.getElementById('jump-page-input');
  elements.jumpPageBtn = document.getElementById('jump-page-btn');
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
  elements.applyPageMapBtn.addEventListener('click', handleApplyPageMap);
  elements.skipLogicalPageBtn.addEventListener('click', handleSkipLogicalPage);
  elements.offsetXInput.addEventListener('input', handleOffsetChange);
  elements.offsetYInput.addEventListener('input', handleOffsetChange);
  elements.jumpPageBtn.addEventListener('click', handleJumpPage);
  elements.jumpPageInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleJumpPage();
  });
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
      state.workbench.dirtyConfig = true;
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

function handleApplyPageMap() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  const page = getCurrentBookPage();
  if (!task || !unit || !page) {
    alert('当前任务不支持页码对齐修改。');
    return;
  }

  const imageFile = elements.pageMapInput.value.trim();
  if (!imageFile) {
    alert('请输入要映射的图片文件名，例如 037.png。');
    return;
  }
  if (!/\.(png|jpg|jpeg|webp)$/i.test(imageFile)) {
    alert('图片文件名需要包含扩展名，例如 037.png。');
    return;
  }

  page.images = page.images || {};
  page.images[unit.copyId] = imageFile;
  persistProjectConfig();
  clearPageDataAfterMappingChange(task, unit);
  touchWorkbench();
  renderWorkspace();
}

function clearPageDataAfterMappingChange(task, unit) {
  const pageKey = getUnitPageKey(unit);
  const template = getTemplate(task.bookId, pageKey);
  if (template?.sourceCopyId === unit.copyId) {
    delete state.workbench.templates[buildTemplateKey(task.bookId, pageKey)];
    Object.keys(state.workbench.attempts)
      .filter(key => key.startsWith(`${task.bookId}__${pageKey}__`))
      .forEach(key => delete state.workbench.attempts[key]);
    return;
  }
  clearAttemptForUnit(task, unit);
}

function handleJumpPage() {
  var pageNo = parseInt(elements.jumpPageInput.value, 10);
  if (!Number.isInteger(pageNo) || pageNo < 1) {
    alert('请输入有效的页码。');
    return;
  }
  var task = getCurrentTask();
  if (!task) return;
  var book = getBook(task.bookId);
  var targetIndex = state.currentTaskUnits.findIndex(function (u) {
    return u.pageNo === pageNo && u.copyId === (book?.templateCopyId || '');
  });
  if (targetIndex < 0) {
    var firstIndex = state.currentTaskUnits.findIndex(function (u) {
      return u.pageNo === pageNo;
    });
    if (firstIndex >= 0) targetIndex = firstIndex;
  }
  if (targetIndex >= 0) {
    state.currentTaskUnitIndex = targetIndex;
    persistTaskCursor();
    renderWorkspace();
  } else {
    alert('未找到第 ' + pageNo + ' 页。');
  }
}

function handleSkipLogicalPage() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  const page = getCurrentBookPage();
  if (!task || !unit || !page) {
    alert('当前任务不支持跳过逻辑页。');
    return;
  }
  if (!confirm('确认跳过当前逻辑页吗？该逻辑页会从所有副本的任务中移除。')) return;

  page.status = 'skip';
  persistProjectConfig();
  const pageKey = getUnitPageKey(unit);
  delete state.workbench.templates[buildTemplateKey(task.bookId, pageKey)];
  Object.keys(state.workbench.attempts)
    .filter(key => key.startsWith(`${task.bookId}__${pageKey}__`))
    .forEach(key => delete state.workbench.attempts[key]);
  state.currentTaskUnitIndex = Math.min(state.currentTaskUnitIndex, Math.max(0, buildTaskUnits(task).length - 1));
  touchWorkbench();
  renderTaskList();
  renderWorkspace();
}

function handleApplyPageMap() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  const book = getBook(task?.bookId);
  if (!task || !unit || !book?.pages?.length || !unit.imageFile) {
    alert('当前任务不支持页码对齐修改，或当前逻辑页没有可重排的扫描图。');
    return;
  }

  const actualPageNo = Number(elements.pageMapInput.value);
  const currentPageNo = getLogicalPageNo(unit);
  if (!Number.isInteger(actualPageNo) || actualPageNo < 1) {
    alert('请输入这张扫描图实际对应的逻辑页，例如 6。');
    return;
  }
  if (actualPageNo < currentPageNo) {
    alert('当前版本只支持从当前页开始向后重排。若需要往前修正，请回到更早的逻辑页操作。');
    return;
  }

  const currentPageIndex = book.pages.findIndex(page => page.logicalPageId === unit.logicalPageId);
  const actualPageIndex = getPageIndexByLogicalNo(book, actualPageNo);
  if (currentPageIndex < 0 || actualPageIndex < 0) {
    alert('输入的实际逻辑页不在当前书本范围内。');
    return;
  }

  const scanFiles = getCopyScanFiles(book, unit.copyId);
  const currentScanIndex = scanFiles.indexOf(unit.imageFile);
  if (currentScanIndex < 0) {
    alert('没有在当前副本文件列表中找到这张扫描图。请确认已选择正确的 data 文件夹。');
    return;
  }

  for (let index = currentPageIndex; index < actualPageIndex; index += 1) {
    book.pages[index].images = book.pages[index].images || {};
    book.pages[index].images[unit.copyId] = null;
  }
  remapCopyFromPage(book, unit.copyId, actualPageIndex, currentScanIndex, scanFiles);
  persistProjectConfig();
  clearPageDataFromIndex(task, book, currentPageIndex);
  touchWorkbench();
  renderTaskList();
  renderWorkspace();
}

function handleSkipLogicalPage() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  const book = getBook(task?.bookId);
  if (!task || !unit || !book?.pages?.length || !unit.imageFile) {
    alert('当前任务不支持跳过扫描图，或当前逻辑页没有可跳过的扫描图。');
    return;
  }
  if (!confirm('确认当前扫描图是封面、目录、空白页等无效页吗？系统会跳过这张图，并从下一张扫描图继续匹配当前逻辑页。')) return;

  const currentPageIndex = book.pages.findIndex(page => page.logicalPageId === unit.logicalPageId);
  const scanFiles = getCopyScanFiles(book, unit.copyId);
  const currentScanIndex = scanFiles.indexOf(unit.imageFile);
  if (currentPageIndex < 0 || currentScanIndex < 0) {
    alert('没有在当前副本文件列表中找到这张扫描图。请确认已选择正确的 data 文件夹。');
    return;
  }

  remapCopyFromPage(book, unit.copyId, currentPageIndex, currentScanIndex + 1, scanFiles);
  persistProjectConfig();
  clearPageDataFromIndex(task, book, currentPageIndex);
  state.currentTaskUnitIndex = Math.min(state.currentTaskUnitIndex, Math.max(0, buildTaskUnits(task).length - 1));
  touchWorkbench();
  renderTaskList();
  renderWorkspace();
}

function handleRedrawTemplate() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  if (!task || !unit) return;
  if (!confirm('确认重做当前页模板？该页所有副本对模板的复用都会失效，需要重新建立。')) return;

  const pageKey = getUnitPageKey(unit);
  delete state.workbench.templates[buildTemplateKey(task.bookId, pageKey)];
  const affectedAttempts = Object.keys(state.workbench.attempts).filter(key => key.startsWith(`${task.bookId}__${pageKey}__`));
  affectedAttempts.forEach(key => delete state.workbench.attempts[key]);
  touchWorkbench();
  renderWorkspace();
}

function handleRedrawCurrentPage() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  if (!task || !unit) return;
  if (!confirm('确认仅重标当前页吗？这会清空当前页的全部标注内容，并改为独立重标，但不会影响共享模板和其他副本。')) return;

  const attemptKey = buildAttemptKey(task.bookId, task.id, unit.copyId, getUnitPageKey(unit));
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
