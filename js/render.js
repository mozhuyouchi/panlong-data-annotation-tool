function renderProjectSummary() {
  elements.projectName.textContent = state.project.projectName || '未命名项目';
  elements.bookCount.textContent = String((state.project.books || []).length);
  elements.taskCount.textContent = String((state.project.tasks || []).length);
}

function renderAnnotatorOptions() {
  const annotators = state.project.annotators || [];
  elements.annotatorSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '请选择标注员';
  elements.annotatorSelect.appendChild(placeholder);

  annotators.forEach(annotator => {
    const option = document.createElement('option');
    option.value = annotator.id;
    option.textContent = `${annotator.id} - ${annotator.label}`;
    elements.annotatorSelect.appendChild(option);
  });

  elements.annotatorSelect.value = state.annotatorId || '';
}

function renderTaskList() {
  const tasks = getTasksForCurrentAnnotator();
  const list = elements.taskList;
  list.innerHTML = '';

  if (!state.annotatorId) {
    list.innerHTML = '<div class="empty-hint">请选择标注员后查看任务。</div>';
    return;
  }

  if (!tasks.length) {
    list.innerHTML = '<div class="empty-hint">当前标注员还没有分配任务。</div>';
    return;
  }

  tasks.forEach(task => {
    const taskUnits = buildTaskUnits(task);
    const completedUnits = taskUnits.filter(unit => {
      const attempt = getAttemptByKey(buildAttemptKey(task.bookId, task.id, unit.copyId, getUnitPageKey(unit)));
      return attempt && attempt.pageStatus === 'completed';
    }).length;
    const pageRangeText = task.logicalPageIds?.length
      ? `${task.logicalPageIds[0]} - ${task.logicalPageIds[task.logicalPageIds.length - 1]}`
      : `${padPage(task.pageStart)} - ${padPage(task.pageEnd)}`;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `task-card${task.id === state.activeTaskId ? ' active' : ''}`;
    card.innerHTML = `
      <h4>${task.title}</h4>
      <div class="task-meta">
        书本：${getBook(task.bookId)?.label || task.bookId}<br>
        页码：${padPage(task.pageStart)} - ${padPage(task.pageEnd)}<br>
        副本数：${task.copyIds.length}<br>
        进度：${completedUnits} / ${taskUnits.length}
      </div>
    `;
    card.addEventListener('click', () => activateTask(task.id));
    list.appendChild(card);
  });
}

function activateTask(taskId) {
  state.activeTaskId = taskId;
  localStorage.setItem(STORAGE_KEYS.activeTaskId, taskId);
  const cursor = state.workbench.taskCursor[taskId];
  state.currentTaskUnitIndex = typeof cursor === 'number' ? cursor : 0;
  renderTaskList();
  syncSelectionToView();
  renderWorkspace();
}

function syncSelectionToView() {
  const annotator = getCurrentAnnotator();
  const task = getCurrentTask();
  elements.currentAnnotatorName.textContent = annotator ? `${annotator.id} - ${annotator.label}` : '未选择';
  elements.currentTaskName.textContent = task ? task.title : '未选择';
}

function renderWorkspace() {
  syncSelectionToView();
  const task = getCurrentTask();
  if (!task) {
    elements.workspaceEmpty.classList.remove('hidden');
    elements.workspaceContent.classList.add('hidden');
    return;
  }

  state.currentTaskUnits = buildTaskUnits(task);
  if (state.currentTaskUnitIndex >= state.currentTaskUnits.length) {
    state.currentTaskUnitIndex = Math.max(0, state.currentTaskUnits.length - 1);
  }

  persistTaskCursor();

  elements.workspaceEmpty.classList.add('hidden');
  elements.workspaceContent.classList.remove('hidden');

  const currentUnit = getCurrentUnit();
  const book = getBook(task.bookId);
  const copy = getCopy(book, currentUnit.copyId);
  const template = getTemplate(task.bookId, getUnitPageKey(currentUnit));
  const attempt = ensureCurrentAttempt();
  const imageFile = resolveImageSource();
  let mode = attempt?.templateMode ? '模板+作答' : '作答标注';
  if (attempt?.detachedFromTemplate) {
    mode = '本页独立重标';
  }

  elements.workspaceBookName.textContent = book ? book.label : task.bookId;
  elements.workspaceCopyName.textContent = copy ? copy.label : currentUnit.copyId;
  elements.workspacePageLabel.textContent = `第 ${currentUnit.pageNo} 页`;
  elements.workspaceModeLabel.textContent = mode;
  elements.taskRangeText.textContent = `${padPage(task.pageStart)} - ${padPage(task.pageEnd)} 页，共 ${task.copyIds.length} 个副本`;
  elements.unitOrderText.textContent = `${state.currentTaskUnitIndex + 1} / ${state.currentTaskUnits.length}`;
  renderTaskProgress(task);
  renderPageMapPanel(currentUnit, copy);

  const templateReady = !!template;
  elements.templateStatusText.textContent = templateReady
    ? `已存在，来源副本：${template.sourceCopyId}`
    : '尚未生成';
  elements.templateHelpText.textContent = attempt?.templateMode
    ? '你正在编辑当前页模板：请继续新增题目、补充标准答案和子题结构。当前副本的作答框也会一起保存。'
    : '当前页模板已存在：题型、题干框、标准答案和子题结构会自动复用。你只需要补作答框、学生答案和作答状态。';
  if (attempt?.detachedFromTemplate) {
    elements.templateStatusText.textContent = '当前页已脱离共享模板，改为独立重标';
    elements.templateHelpText.textContent = '当前页已经清空为独立重标状态。你可以重新框选题干、作答区、标准答案和学生答案；这些修改只作用于当前页，不会影响共享模板和其他副本。';
  }

  elements.redrawTemplateBtn.disabled = !templateReady;
  elements.redrawCurrentPageBtn.disabled = !attempt;
  elements.templateOffsetControls.classList.toggle('hidden', !templateReady || !!attempt?.templateMode || !!attempt?.detachedFromTemplate);

  attempt.templateOffset = attempt.templateOffset || { x: 0, y: 0 };
  elements.offsetXInput.value = attempt.templateOffset.x;
  elements.offsetYInput.value = attempt.templateOffset.y;

  renderPageStatusButtons(attempt);
  renderCurrentImage(imageFile);
  renderAnnotationsList();
  renderAnnotationBoxes();
  applyRegionZoomStyles();
}

function renderPageMapPanel(unit, copy) {
  if (!elements.pageMapSection) return;
  const hasPageMap = !!unit?.logicalPageId;
  elements.pageMapSection.classList.toggle('hidden', !hasPageMap);
  if (!hasPageMap) return;

  elements.pageMapLogical.textContent = `${unit.logicalPageId}${unit.pageLabel ? `（${unit.pageLabel}）` : ''}`;
  elements.pageMapCopy.textContent = copy ? copy.label : unit.copyId;
  elements.pageMapImage.textContent = unit.missingPage ? '缺页' : (unit.imageFile || '-');
  elements.pageMapInput.value = getLogicalPageNo(unit) || '';
}

function setActiveRegion(regionId) {
  state.activeRegionId = regionId;
  elements.panelRegions.forEach(region => {
    region.classList.toggle('active-region', region.id === regionId);
  });
}

function handleRegionWheel(event, region) {
  if (region.id === 'image-region') return;
  if (!event.ctrlKey) return;
  event.preventDefault();
  setActiveRegion(region.id);
  const currentZoom = state.regionZoom[region.id] || 1;
  const delta = event.deltaY < 0 ? 0.1 : -0.1;
  state.regionZoom[region.id] = clamp(currentZoom + delta, 0.75, 2);
  applyRegionZoomStyles();
}

function applyRegionZoomStyles() {
  Object.entries(state.regionZoom).forEach(([regionId, zoomValue]) => {
    if (regionId === 'image-region') return;
    const region = document.getElementById(regionId);
    if (region) {
      region.style.setProperty('--panel-scale', String(zoomValue));
    }
  });
}

function applyImageZoomStyle() {
  const stage = elements.imageZoomStage;
  const container = elements.imageContainer;
  const placeholder = elements.imagePlaceholder;
  if (!stage) return;

  state.regionZoom['image-region'] = 1;
  if (!container.classList.contains('hidden') && container.offsetWidth > 0 && container.offsetHeight > 0) {
    container.style.transform = '';
    stage.style.transform = '';
    stage.style.width = `${Math.ceil(container.offsetWidth)}px`;
    stage.style.height = `${Math.ceil(container.offsetHeight)}px`;
    placeholder.style.transform = '';
    placeholder.style.width = '';
    placeholder.style.display = 'none';
  } else {
    container.style.transform = '';
    stage.style.transform = '';
    stage.style.width = '100%';
    stage.style.height = 'auto';
    placeholder.style.display = '';
    placeholder.style.transform = '';
    placeholder.style.width = '';
  }
}

function renderTaskProgress(task) {
  const units = buildTaskUnits(task);
  const completed = units.filter(unit => {
    const attempt = getAttemptByKey(buildAttemptKey(task.bookId, task.id, unit.copyId, getUnitPageKey(unit)));
    return attempt && attempt.pageStatus === 'completed';
  }).length;
  const pct = units.length ? Math.round((completed / units.length) * 100) : 0;
  elements.taskProgressText.textContent = `${completed} / ${units.length}`;
  elements.taskProgressFill.style.width = `${pct}%`;
}

function renderPageStatusButtons(attempt) {
  const container = elements.pageStatusButtons;
  container.innerHTML = '';
  PAGE_STATUSES.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `status-btn${attempt.pageStatus === item.id ? ' active' : ''}`;
    btn.dataset.status = item.id;
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      attempt.pageStatus = item.id;
      attempt.updatedAt = new Date().toISOString();
      autoSaveWorkbench();
      renderWorkspace();
    });
    container.appendChild(btn);
  });
}

function renderCurrentImage(source) {
  if (!source) {
    elements.imagePlaceholder.classList.remove('hidden');
    elements.imageContainer.classList.add('hidden');
    elements.currentFilename.textContent = '未找到';
    elements.infoSize.textContent = '-';
    elements.mainImage.onload = null;
    elements.mainImage.onerror = null;
    elements.mainImage.removeAttribute('src');
    applyImageZoomStyle();
    return;
  }

  const isUrl = typeof source === 'string';
  const src = isUrl ? source : URL.createObjectURL(source);

  elements.mainImage.onload = function() {
    state.imageNaturalW = elements.mainImage.naturalWidth;
    state.imageNaturalH = elements.mainImage.naturalHeight;
    elements.infoSize.textContent = `${state.imageNaturalW} × ${state.imageNaturalH}`;
    updateDisplaySize();
    renderAnnotationBoxes();
    applyImageZoomStyle();
    if (!isUrl) URL.revokeObjectURL(src);
  };
  elements.mainImage.onerror = function() {
    elements.imagePlaceholder.classList.remove('hidden');
    elements.imageContainer.classList.add('hidden');
    elements.infoSize.textContent = '鍔犺浇澶辫触';
    applyImageZoomStyle();
    if (!isUrl) URL.revokeObjectURL(src);
  };
  elements.currentFilename.textContent = isUrl ? source.split('/').pop() : source.name;
  elements.imagePlaceholder.classList.add('hidden');
  elements.imageContainer.classList.remove('hidden');
  elements.mainImage.src = src;
  if (elements.mainImage.complete) {
    if (elements.mainImage.naturalWidth > 0) {
      elements.mainImage.onload();
    } else {
      elements.mainImage.onerror();
    }
  }
}

function renderAnnotationsList() {
  const list = elements.annotationsList;
  const attempt = getCurrentAttempt();
  if (!attempt || !attempt.questions.length) {
    list.innerHTML = '<div class="empty-hint">当前页还没有题目，请先新增题目或加载已有模板。</div>';
    return;
  }

  list.innerHTML = '';
  attempt.questions.forEach((question, index) => {
    const cfg = typeConfig[question.type];
    const item = document.createElement('div');
    item.className = `annotation-item ${question.questionId === state.selectedQuestionId ? 'selected' : ''}${question.fromTemplate ? ' readonly' : ''}`;
    item.style.borderLeftColor = cfg.borderColor;

    const head = document.createElement('div');
    head.className = 'annotation-head';
    head.innerHTML = `
      <span class="annotation-number">#${index + 1}</span>
      <span class="annotation-badge ${cfg.colorClass}">${cfg.label}</span>
    `;

    const actionWrap = document.createElement('div');
    actionWrap.className = 'annotation-actions';

    if (isTemplateMode()) {
      const subBtn = document.createElement('button');
      subBtn.type = 'button';
      subBtn.className = 'mini-btn';
      subBtn.textContent = '选中';
      subBtn.addEventListener('click', e => {
        e.stopPropagation();
        selectQuestion(question.questionId);
      });
      actionWrap.appendChild(subBtn);

      if (question.type === 'qa') {
        const addSubBtn = document.createElement('button');
        addSubBtn.type = 'button';
        addSubBtn.className = 'mini-btn';
        addSubBtn.textContent = '新增子题';
        addSubBtn.addEventListener('click', e => {
          e.stopPropagation();
          startTemplateSubQuestionDraw(question.questionId);
        });
        actionWrap.appendChild(addSubBtn);
      }
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'mini-btn danger-btn';
      deleteBtn.textContent = '删除题目';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        removeQuestion(question.questionId);
      });
      actionWrap.appendChild(deleteBtn);
    } else {
      const drawAnswerBtn = document.createElement('button');
      drawAnswerBtn.type = 'button';
      drawAnswerBtn.className = 'mini-btn';
      drawAnswerBtn.textContent = question.answer ? '重绘作答框' : '框选作答区';
      drawAnswerBtn.addEventListener('click', e => {
        e.stopPropagation();
        startAttemptAnswerDraw(question.questionId);
      });
      actionWrap.appendChild(drawAnswerBtn);
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'mini-btn danger-btn';
      clearBtn.textContent = '清空本题';
      clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        clearQuestionAttempt(question.questionId);
      });
      actionWrap.appendChild(clearBtn);
    }

    head.appendChild(actionWrap);
    item.appendChild(head);

    if (!isTemplateMode()) {
      const answerBoxState = document.createElement('div');
      answerBoxState.className = 'muted';
      answerBoxState.textContent = question.answer ? '当前副本作答框：已绘制' : '当前副本作答框：未绘制';
      item.appendChild(answerBoxState);
    }

    renderQuestionStatusSection(item, question, index);
    renderTemplateAnswerSection(item, question);
    renderStudentAnswerSection(item, question);
    renderSubQuestionsSection(item, question);

    item.addEventListener('click', () => selectQuestion(question.questionId));
    list.appendChild(item);
  });
}

function renderQuestionStatusSection(container, question) {
  const area = document.createElement('div');
  area.style.marginTop = '8px';
  area.innerHTML = '<div class="status-label">作答状态</div>';
  const btns = document.createElement('div');
  btns.className = 'status-btns';
  typeConfig[question.type].statuses.forEach(statusId => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `status-btn ${question.status === statusId ? 'active' : ''}`;
    btn.dataset.status = statusId === 'correct' ? 'completed' : statusId === 'wrong' ? 'issue' : 'hold';
    btn.textContent = statusConfig[statusId].label;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      question.status = statusId;
      if (statusId === 'correct') copyAnswerKeyToStudent(question);
      touchCurrentAttempt();
      renderAnnotationsList();
    });
    btns.appendChild(btn);
  });
  area.appendChild(btns);
  container.appendChild(area);
}

function renderScoreSection(container, question) {
  const grid = document.createElement('div');
  grid.className = 'info-grid';
  grid.innerHTML = `
    <div>
        <div class="status-label">学生得分</div>
        <input class="compact-input" type="number" min="0" value="${escapeHtml(question.studentScore || '')}" placeholder="得分">
    </div>
    <div>
        <div class="status-label">题目总分</div>
        <input class="compact-input" type="number" min="0" value="${escapeHtml(question.totalScore || '')}" placeholder="总分">
    </div>
  `;
  const inputs = grid.querySelectorAll('input');
  inputs.forEach(input => {
    input.type = 'number';
    input.step = 'any';
    input.min = '0';
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('mousedown', e => e.stopPropagation());
  });
  inputs[0].addEventListener('input', function() {
    question.studentScore = this.value;
    touchCurrentAttempt();
  });
  inputs[1].addEventListener('input', function() {
    question.totalScore = this.value;
    touchCurrentAttempt();
  });
  container.appendChild(grid);
}

function renderTemplateAnswerSection(container, question) {
  const area = document.createElement('div');
  area.style.marginTop = '8px';
  const label = document.createElement('div');
  label.className = 'status-label';
  label.textContent = '标准答案';
  area.appendChild(label);

  if (question.type === 'single' || question.type === 'multiple') {
    buildOptionAnswerSelector(area, question, 'answer_key', question.type === 'multiple', true);
  } else {
    buildTextAndImageAnswerEditor(area, question, 'answer_key', 'answer_key_images', '输入标准答案文字...', true);
  }
  attachAnswerKeySync(area, question);
  container.appendChild(area);
}

function renderStudentAnswerSection(container, question) {
  const area = document.createElement('div');
  area.style.marginTop = '8px';
  const label = document.createElement('div');
  label.className = 'status-label';
  label.textContent = '学生答案';
  area.appendChild(label);

  if (question.type === 'single' || question.type === 'multiple') {
    buildOptionAnswerSelector(area, question, 'student_answer', question.type === 'multiple', true);
  } else {
    buildTextAndImageAnswerEditor(area, question, 'student_answer', 'student_answer_images', '输入学生答案文字...', true);
  }
  container.appendChild(area);
}

function renderSubQuestionsSection(container, question) {
  if (question.type !== 'qa' && question.type !== 'fill') return;
  var isFill = question.type === 'fill';

  const subArea = document.createElement('div');
  subArea.className = 'sub-question-area';

  if (!question.subQuestions || question.subQuestions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = isFill ? '当前填空题还没有作答区。' : (isTemplateMode() ? '当前问答题还没有子题。' : '当前模板没有子题。');
    subArea.appendChild(empty);
    container.appendChild(subArea);
    return;
  }

  question.subQuestions.forEach((subQuestion, subIndex) => {
    const subItem = document.createElement('div');
    subItem.className = 'sub-question-item';
    const head = document.createElement('div');
    head.className = 'sub-question-head';
    head.innerHTML = isFill ? `<strong>作答框 ${subIndex + 1}</strong>` : `<strong>子题 ${subIndex + 1}</strong>`;

    const info = document.createElement('span');
    info.className = 'muted';
    info.textContent = subQuestion.answer ? '作答框已绘制' : '作答框未绘制';
    head.appendChild(info);

    if (!isTemplateMode()) {
      const drawBtn = document.createElement('button');
      drawBtn.type = 'button';
      drawBtn.className = 'mini-btn';
      drawBtn.textContent = subQuestion.answer ? '重绘作答框' : '框选作答区';
      drawBtn.addEventListener('click', e => {
        e.stopPropagation();
        startAttemptSubAnswerDraw(question.questionId, subQuestion.subQuestionId);
      });
      head.appendChild(drawBtn);
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'mini-btn danger-btn';
      clearBtn.textContent = '清空子题';
      clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        clearSubQuestionAttempt(question.questionId, subQuestion.subQuestionId);
      });
      head.appendChild(clearBtn);
    } else {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'mini-btn danger-btn';
      deleteBtn.textContent = '删除子题';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        removeSubQuestion(question.questionId, subQuestion.subQuestionId);
      });
      head.appendChild(deleteBtn);
    }

    subItem.appendChild(head);

    const statusWrap = document.createElement('div');
    statusWrap.style.marginTop = '8px';
    const statusLabel = document.createElement('div');
    statusLabel.className = 'status-label';
    statusLabel.textContent = '作答状态';
    statusWrap.appendChild(statusLabel);
    const statusBtns = document.createElement('div');
    statusBtns.className = 'status-btns';
    ['correct', 'wrong', 'partial', 'blank'].forEach(statusId => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `status-btn ${subQuestion.status === statusId ? 'active' : ''}`;
      btn.dataset.status = statusId === 'correct' ? 'completed' : statusId === 'wrong' ? 'issue' : 'hold';
      btn.textContent = statusConfig[statusId].label;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        subQuestion.status = statusId;
        if (statusId === 'correct') copyAnswerKeyToStudent(subQuestion);
        touchCurrentAttempt();
        renderAnnotationsList();
      });
      statusBtns.appendChild(btn);
    });
    statusWrap.appendChild(statusBtns);
    subItem.appendChild(statusWrap);


    if (!isFill) {
      const standardAnswerArea = document.createElement('div');
      standardAnswerArea.style.marginTop = '8px';
      const standardLabel = document.createElement('div');
      standardLabel.className = 'status-label';
      standardLabel.textContent = '子题标准答案';
      standardAnswerArea.appendChild(standardLabel);
      buildTextAndImageAnswerEditor(
        standardAnswerArea,
        subQuestion,
        'answer_key',
        'answer_key_images',
        '输入子题标准答案文字...',
        true
      );
      attachAnswerKeySync(standardAnswerArea, subQuestion);
      subItem.appendChild(standardAnswerArea);

      const studentAnswerArea = document.createElement('div');
      studentAnswerArea.style.marginTop = '8px';
      const studentLabel = document.createElement('div');
      studentLabel.className = 'status-label';
      studentLabel.textContent = '子题学生答案';
      studentAnswerArea.appendChild(studentLabel);
      buildTextAndImageAnswerEditor(
        studentAnswerArea,
        subQuestion,
        'student_answer',
        'student_answer_images',
        '输入子题学生答案文字...',
        true
      );
      subItem.appendChild(studentAnswerArea);
    }

    subArea.appendChild(subItem);
  });

  container.appendChild(subArea);
}

function renderAnnotationBoxes() {
  document.querySelectorAll('.annotation-box, .temp-box').forEach(el => el.remove());
  const attempt = getCurrentAttempt();
  if (!attempt) {
    renderPendingTemplateBoxes();
    return;
  }

  const offset = attempt.templateOffset || { x: 0, y: 0 };
  attempt.questions.forEach((question, index) => {
    const cfg = typeConfig[question.type];
    const stemLabel = `#${index + 1} ${cfg.label} 题干`;
    if (question.stem?.bbox) {
      const bbox = question.fromTemplate ? applyOffsetToBbox(question.stem.bbox, offset) : question.stem.bbox;
      const region = imageToDisplayRegion(bbox);
      if (region) drawAnnotationBox(region, cfg.colorClass, cfg.borderColor, stemLabel, false, question.questionId, question.questionId === state.selectedQuestionId);
    }
    if (question.answer?.bbox) {
      const ansBbox = question.fromTemplate ? applyOffsetToBbox(question.answer.bbox, offset) : question.answer.bbox;
      const region = imageToDisplayRegion(ansBbox);
      if (region) drawAnnotationBox(region, cfg.colorClass, cfg.borderColor, `#${index + 1} 作答`, true, question.questionId, question.questionId === state.selectedQuestionId);
    }
    if (question.subQuestions) {
      var isFill = question.type === 'fill';
      question.subQuestions.forEach((subQuestion, subIndex) => {
        const subColor = '#19837b';
        if (subQuestion.stem?.bbox) {
          const bbox = question.fromTemplate ? applyOffsetToBbox(subQuestion.stem.bbox, offset) : subQuestion.stem.bbox;
          const region = imageToDisplayRegion(bbox);
          var subSelected = subQuestion.subQuestionId === state.selectedQuestionId || question.questionId === state.selectedQuestionId;
          if (region) drawAnnotationBox(region, cfg.colorClass, subColor, `#${index + 1}-${subIndex + 1} 子题题干`, false, subQuestion.subQuestionId, subSelected);
        }
        if (subQuestion.answer?.bbox) {
          const subAnsBbox = question.fromTemplate ? applyOffsetToBbox(subQuestion.answer.bbox, offset) : subQuestion.answer.bbox;
          const region = imageToDisplayRegion(subAnsBbox);
          var ansLabel = isFill ? `作答框${subIndex + 1}` : `#${index + 1}-${subIndex + 1} 作答`;
          var subSelected2 = subQuestion.subQuestionId === state.selectedQuestionId || question.questionId === state.selectedQuestionId;
          if (region) drawAnnotationBox(region, cfg.colorClass, subColor, ansLabel, true, subQuestion.subQuestionId, subSelected2);
        }
      });
    }
  });

  renderPendingTemplateBoxes();
}

function drawAnnotationBox(region, colorClass, borderColor, labelText, isAnswer, questionId, isSelected) {
  const box = document.createElement('div');
  box.className = `annotation-box ${colorClass}`;
  box.dataset.questionId = questionId;
  box.style.left = `${region.x}px`;
  box.style.top = `${region.y}px`;
  box.style.width = `${region.w}px`;
  box.style.height = `${region.h}px`;
  box.style.borderColor = borderColor;
  box.style.borderStyle = isAnswer ? 'dashed' : 'solid';
  box.style.background = `${borderColor}18`;
  box.style.opacity = isSelected ? '1' : '0.45';
  box.style.zIndex = isSelected ? '10' : '1';

  var label = document.createElement('div');
  label.className = 'box-label';
  label.style.background = borderColor;
  label.textContent = labelText;
  box.appendChild(label);

  box.dataset.section = isAnswer ? 'answer' : 'stem';
  if (isSelected) box.classList.add('selected');
  addDragResizeToBox(box, questionId, region);

  box.addEventListener('click', function (e) {
    e.stopPropagation();
    selectQuestion(questionId);
  });

  elements.imageContainer.appendChild(box);
}

var dragState = null;

function addDragResizeToBox(box, questionId, region) {
  box.addEventListener('mousedown', function (e) {
    if (state.drawingPhase) return;
    if (e.target === box || e.target.className === 'box-label') {
      e.stopPropagation();
      e.preventDefault();
      var rect = box.getBoundingClientRect();
      var containerRect = elements.imageContainer.getBoundingClientRect();
      dragState = {
        type: 'move',
        questionId: questionId,
        box: box,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: box.offsetLeft,
        origTop: box.offsetTop,
        origW: box.offsetWidth,
        origH: box.offsetHeight,
        containerLeft: containerRect.left,
        containerTop: containerRect.top,
      };
    }
  });

  var handles = ['nw', 'ne', 'sw', 'se'];
  handles.forEach(function (pos) {
    var h = document.createElement('div');
    h.className = 'resize-handle resize-' + pos;
    h.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      e.preventDefault();
      var containerRect = elements.imageContainer.getBoundingClientRect();
      dragState = {
        type: 'resize',
        questionId: questionId,
        box: box,
        handle: pos,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: box.offsetLeft,
        origTop: box.offsetTop,
        origW: box.offsetWidth,
        origH: box.offsetHeight,
        containerLeft: containerRect.left,
        containerTop: containerRect.top,
      };
    });
    box.appendChild(h);
  });
}

document.addEventListener('mousemove', function (e) {
  if (!dragState) return;
  var dx = e.clientX - dragState.startX;
  var dy = e.clientY - dragState.startY;

  if (dragState.type === 'move') {
    dragState.box.style.left = (dragState.origLeft + dx) + 'px';
    dragState.box.style.top = (dragState.origTop + dy) + 'px';
  } else if (dragState.type === 'resize') {
    var minW = 20, minH = 20;
    var newLeft = dragState.origLeft;
    var newTop = dragState.origTop;
    var newW = dragState.origW;
    var newH = dragState.origH;

    if (dragState.handle.indexOf('e') >= 0) {
      newW = Math.max(minW, dragState.origW + dx);
    }
    if (dragState.handle.indexOf('w') >= 0) {
      var w2 = Math.max(minW, dragState.origW - dx);
      newLeft = dragState.origLeft + (dragState.origW - w2);
      newW = w2;
    }
    if (dragState.handle.indexOf('s') >= 0) {
      newH = Math.max(minH, dragState.origH + dy);
    }
    if (dragState.handle.indexOf('n') >= 0) {
      var h2 = Math.max(minH, dragState.origH - dy);
      newTop = dragState.origTop + (dragState.origH - h2);
      newH = h2;
    }

    dragState.box.style.left = newLeft + 'px';
    dragState.box.style.top = newTop + 'px';
    dragState.box.style.width = newW + 'px';
    dragState.box.style.height = newH + 'px';
  }
});

document.addEventListener('mouseup', function () {
  if (!dragState) return;
  var box = dragState.box;
  var questionId = dragState.questionId;
  var newLeft = box.offsetLeft;
  var newTop = box.offsetTop;
  var newW = box.offsetWidth;
  var newH = box.offsetHeight;
  dragState = null;

  var attempt = getCurrentAttempt();
  if (!attempt) return;

  updateDisplaySize();
  var newDisplay = { x: newLeft, y: newTop, w: newW, h: newH };
  var newBbox = displayToImageBbox(newDisplay);

  var section = box.dataset.section || 'stem';
  var offset = attempt.templateOffset || { x: 0, y: 0 };
  var found = findQuestionAndUpdate(attempt, questionId, section, newDisplay, newBbox, offset);
  if (found) {
    touchCurrentAttempt();
    renderAnnotationsList();
  }
});

function findQuestionAndUpdate(attempt, questionId, section, newDisplay, newBbox, offset) {
  function updateField(target) {
    if (section === 'stem' && target.stem) {
      target.stem.display = newDisplay;
      target.stem.bbox = newBbox;
      return true;
    }
    if (section === 'answer') {
      target.answer = { display: newDisplay, bbox: newBbox };
      return true;
    }
    return false;
  }
  var q = attempt.questions.find(function (item) { return item.questionId === questionId; });
  if (q && updateField(q)) return true;
  for (var i = 0; i < attempt.questions.length; i++) {
    var subQs = attempt.questions[i].subQuestions || [];
    for (var j = 0; j < subQs.length; j++) {
      if (subQs[j].subQuestionId === questionId && updateField(subQs[j])) return true;
    }
  }
  return false;
}

function renderPendingTemplateBoxes() {
  if (state.pendingQuestion?.stem) {
    const cfg = typeConfig[state.pendingQuestion.type];
    drawTempBox(state.pendingQuestion.stem.display, cfg.borderColor, `${cfg.label} 题干`);
  }

  if (state.pendingSubQuestion?.stem) {
    drawTempBox(state.pendingSubQuestion.stem.display, '#19837b', '子题题干');
  }
}

function removeQuestion(questionId) {
  const attempt = getCurrentAttempt();
  if (!attempt) return;
  attempt.questions = attempt.questions.filter(question => question.questionId !== questionId);
  normalizeQuestionOrders(attempt.questions);
  if (state.selectedQuestionId === questionId) {
    state.selectedQuestionId = attempt.questions[0]?.questionId || null;
  }
  if (state.pendingAnswerTarget?.questionId === questionId) {
    state.pendingAnswerTarget = null;
    setDrawingPhase(null);
  }
  touchCurrentAttempt();
  renderWorkspace();
}

function removeSubQuestion(questionId, subQuestionId) {
  const attempt = getCurrentAttempt();
  const question = attempt?.questions.find(item => item.questionId === questionId);
  if (!question || !Array.isArray(question.subQuestions)) return;
  question.subQuestions = question.subQuestions.filter(subQuestion => subQuestion.subQuestionId !== subQuestionId);
  normalizeSubQuestionOrders(question);
  if (
    state.pendingAnswerTarget?.questionId === questionId &&
    state.pendingAnswerTarget?.subQuestionId === subQuestionId
  ) {
    state.pendingAnswerTarget = null;
    setDrawingPhase(null);
  }
  touchCurrentAttempt();
  renderWorkspace();
}

function clearQuestionAttempt(questionId) {
  const attempt = getCurrentAttempt();
  const question = attempt?.questions.find(item => item.questionId === questionId);
  if (!question) return;
  question.answer = null;
  question.status = null;
  question.totalScore = '';
  question.studentScore = '';
  question.note = '';
  question.student_answer = '';
  question.student_answer_images = [];
  (question.subQuestions || []).forEach(subQuestion => {
    clearSubQuestionAttemptData(subQuestion);
  });
  if (state.pendingAnswerTarget?.questionId === questionId) {
    state.pendingAnswerTarget = null;
    setDrawingPhase(null);
  }
  touchCurrentAttempt();
  renderWorkspace();
}

function clearSubQuestionAttempt(questionId, subQuestionId) {
  const attempt = getCurrentAttempt();
  const question = attempt?.questions.find(item => item.questionId === questionId);
  const subQuestion = question?.subQuestions?.find(item => item.subQuestionId === subQuestionId);
  if (!subQuestion) return;
  clearSubQuestionAttemptData(subQuestion);
  if (
    state.pendingAnswerTarget?.questionId === questionId &&
    state.pendingAnswerTarget?.subQuestionId === subQuestionId
  ) {
    state.pendingAnswerTarget = null;
    setDrawingPhase(null);
  }
  touchCurrentAttempt();
  renderWorkspace();
}

function clearSubQuestionAttemptData(subQuestion) {
  subQuestion.answer = null;
  subQuestion.status = null;
  subQuestion.totalScore = '';
  subQuestion.studentScore = '';
  subQuestion.note = '';
  subQuestion.student_answer = '';
  subQuestion.student_answer_images = [];
}

function normalizeQuestionOrders(questions) {
  const bookId = getCurrentTask()?.bookId;
  const pageNo = getCurrentUnit()?.pageNo;
  questions.forEach((question, index) => {
    question.order = index + 1;
    if (bookId && pageNo) {
      question.questionId = buildQuestionId(bookId, pageNo, index + 1);
    }
    normalizeSubQuestionOrders(question);
  });
}

function normalizeSubQuestionOrders(question) {
  (question.subQuestions || []).forEach((subQuestion, index) => {
    subQuestion.order = index + 1;
    subQuestion.subQuestionId = `${question.questionId}__s${String(index + 1).padStart(2, '0')}`;
  });
}

function drawTempBox(region, borderColor, labelText) {
  const box = document.createElement('div');
  box.className = 'annotation-box temp-box';
  box.style.left = `${region.x}px`;
  box.style.top = `${region.y}px`;
  box.style.width = `${region.w}px`;
  box.style.height = `${region.h}px`;
  box.style.borderColor = borderColor;
  box.style.borderStyle = 'solid';
  box.style.background = `${borderColor}18`;
  box.style.opacity = '1';
  box.style.zIndex = '20';
  box.style.pointerEvents = 'none';
  box.style.cursor = 'default';

  const label = document.createElement('div');
  label.className = 'box-label';
  label.style.background = borderColor;
  label.textContent = labelText;
  box.appendChild(label);

  elements.imageContainer.appendChild(box);
}

function copyAnswerKeyToStudent(target) {
  target.student_answer = target.answer_key;
  target.student_answer_images = (target.answer_key_images || []).slice();
}

function attachAnswerKeySync(area, target) {
  area.addEventListener('input', function () {
    if (target.status === 'correct') {
      copyAnswerKeyToStudent(target);
    }
  });
  area.addEventListener('change', function () {
    if (target.status === 'correct') {
      copyAnswerKeyToStudent(target);
    }
  });
}

function selectQuestion(questionId) {
  state.selectedQuestionId = questionId;
  renderAnnotationsList();
  renderAnnotationBoxes();
}

function setCurrentType(type) {
  state.currentType = type;
  elements.questionTypeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.type === type));
}

