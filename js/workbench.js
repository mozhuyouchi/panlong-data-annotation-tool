function ensureCurrentAttempt() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  if (!task || !unit) return null;
  const attemptKey = buildAttemptKey(task.bookId, task.id, unit.copyId, unit.pageNo);
  let attempt = state.workbench.attempts[attemptKey];
  const template = getTemplate(task.bookId, unit.pageNo);

  if (!attempt) {
    if (template) {
      attempt = createAttemptFromTemplate(task, unit, template);
    } else {
      attempt = createBlankAttempt(task, unit);
    }
    state.workbench.attempts[attemptKey] = attempt;
    autoSaveWorkbench();
  }

  const shouldHydrateFromTemplate =
    template &&
    unit.copyId !== template.sourceCopyId &&
    !attempt.detachedFromTemplate &&
    (
      attempt.templateMode ||
      !attempt.questions.length
    );

  if (shouldHydrateFromTemplate) {
    const nextAttempt = createAttemptFromTemplate(task, unit, template);
    nextAttempt.pageStatus = attempt.pageStatus || 'not_started';
    nextAttempt.templateOffset = attempt.templateOffset || { x: 0, y: 0 };
    nextAttempt.createdAt = attempt.createdAt || nextAttempt.createdAt;
    nextAttempt.updatedAt = new Date().toISOString();
    state.workbench.attempts[attemptKey] = nextAttempt;
    attempt = nextAttempt;
    autoSaveWorkbench();
  }

  if (!template && attempt.questions.length && !attempt.detachedFromTemplate) {
    upsertTemplateFromAttempt(task.bookId, unit.pageNo, unit.copyId, attempt);
  }

  return attempt;
}

function createBlankAttempt(task, unit) {
  return {
    attemptKey: buildAttemptKey(task.bookId, task.id, unit.copyId, unit.pageNo),
    taskId: task.id,
    bookId: task.bookId,
    copyId: unit.copyId,
    pageNo: unit.pageNo,
    pageStatus: 'not_started',
    templateMode: true,
    detachedFromTemplate: false,
    templateOffset: { x: 0, y: 0 },
    questions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createDetachedAttempt(task, unit) {
  return {
    attemptKey: buildAttemptKey(task.bookId, task.id, unit.copyId, unit.pageNo),
    taskId: task.id,
    bookId: task.bookId,
    copyId: unit.copyId,
    pageNo: unit.pageNo,
    pageStatus: 'not_started',
    templateMode: true,
    detachedFromTemplate: true,
    templateOffset: { x: 0, y: 0 },
    questions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createAttemptFromTemplate(task, unit, template) {
  return {
    attemptKey: buildAttemptKey(task.bookId, task.id, unit.copyId, unit.pageNo),
    taskId: task.id,
    bookId: task.bookId,
    copyId: unit.copyId,
    pageNo: unit.pageNo,
    pageStatus: 'not_started',
    templateMode: false,
    detachedFromTemplate: false,
    templateOffset: { x: 0, y: 0 },
    questions: template.questions.map(question => cloneTemplateQuestionToAttempt(question)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function cloneTemplateQuestionToAttempt(question) {
  return {
    questionId: question.questionId,
    order: question.order,
    type: question.type,
    stem: deepClone(question.stem),
    answer: null,
    status: null,
    totalScore: question.totalScore || '',
    studentScore: '',
    note: '',
    answer_key: question.answer_key || '',
    answer_key_images: deepClone(question.answer_key_images || []),
    student_answer: '',
    student_answer_images: [],
    subQuestions: question.subQuestions ? question.subQuestions.map(subQuestion => ({
      subQuestionId: subQuestion.subQuestionId,
      order: subQuestion.order,
      stem: deepClone(subQuestion.stem),
      answer: null,
      status: null,
      totalScore: subQuestion.totalScore || '',
      studentScore: '',
      note: '',
      answer_key: subQuestion.answer_key || '',
      answer_key_images: deepClone(subQuestion.answer_key_images || []),
      student_answer: '',
      student_answer_images: []
    })) : [],
    fromTemplate: true
  };
}

function upsertTemplateFromAttempt(bookId, pageNo, sourceCopyId, attempt) {
  state.workbench.templates[buildTemplateKey(bookId, pageNo)] = {
    templateKey: buildTemplateKey(bookId, pageNo),
    bookId,
    pageNo,
    sourceCopyId,
    createdAt: new Date().toISOString(),
    questions: attempt.questions.map(question => ({
      questionId: question.questionId,
      order: question.order,
      type: question.type,
      stem: deepClone(question.stem),
      totalScore: question.totalScore || '',
      answer_key: question.answer_key || '',
      answer_key_images: deepClone(question.answer_key_images || []),
      subQuestions: (question.subQuestions || []).map(subQuestion => ({
        subQuestionId: subQuestion.subQuestionId,
        order: subQuestion.order,
        stem: deepClone(subQuestion.stem),
        totalScore: subQuestion.totalScore || '',
        answer_key: subQuestion.answer_key || '',
        answer_key_images: deepClone(subQuestion.answer_key_images || [])
      }))
    }))
  };
  autoSaveWorkbench();
}

function buildTaskUnits(task) {
  const units = [];
  for (let pageNo = task.pageStart; pageNo <= task.pageEnd; pageNo += 1) {
    task.copyIds.forEach(copyId => {
      units.push({ pageNo, copyId });
    });
  }
  return units;
}

function stepTaskUnit(direction) {
  const nextIndex = state.currentTaskUnitIndex + direction;
  if (nextIndex < 0 || nextIndex >= state.currentTaskUnits.length) return;
  state.currentTaskUnitIndex = nextIndex;
  persistTaskCursor();
  renderWorkspace();
}

function persistTaskCursor() {
  const task = getCurrentTask();
  if (!task) return;
  state.workbench.taskCursor[task.id] = state.currentTaskUnitIndex;
  autoSaveWorkbench();
}

function touchCurrentAttempt() {
  const attempt = getCurrentAttempt();
  if (!attempt) return;
  attempt.updatedAt = new Date().toISOString();
  attempt.pageStatus = attempt.pageStatus === 'not_started' ? 'in_progress' : attempt.pageStatus;
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  if (isTemplateMode() && attempt.questions.length && !attempt.detachedFromTemplate) {
    upsertTemplateFromAttempt(task.bookId, unit.pageNo, unit.copyId, attempt);
  } else {
    autoSaveWorkbench();
  }
  renderTaskProgress(task);
}

function touchWorkbench() {
  autoSaveWorkbench();
}

function autoSaveWorkbench() {
  clearTimeout(state.saveTimeout);
  setSaveIndicator('保存中...');
  state.saveTimeout = setTimeout(async () => {
    await dbSet('workbench', state.workbench);
    setSaveIndicator(`已保存 ${new Date().toLocaleTimeString()}`);
  }, 250);
}

function setSaveIndicator(text) {
  elements.saveIndicator.textContent = text;
}

function exportTaskJsonPackage() {
  const task = getCurrentTask();
  if (!task) {
    alert('请先选择任务。');
    return;
  }

  const book = getBook(task.bookId);
  const taskAttempts = buildTaskUnits(task).map(unit => {
    const attempt = getAttemptByKey(buildAttemptKey(task.bookId, task.id, unit.copyId, unit.pageNo));
    return attempt ? exportAttemptRecord(task, book, attempt) : null;
  }).filter(Boolean);

  const payload = {
    project_name: state.project.projectName,
    task,
    exported_at: new Date().toISOString(),
    templates: buildTaskTemplateRecords(task, book),
    attempts: taskAttempts
  };

  downloadTextFile(`${task.id}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function exportTemplateJsonl() {
  const task = getCurrentTask();
  if (!task) {
    alert('请先选择任务。');
    return;
  }
  const book = getBook(task.bookId);
  const rows = buildTaskTemplateRecords(task, book).map(record => JSON.stringify(record));
  downloadTextFile(`${task.id}.template.jsonl`, rows.join('\n'), 'application/x-ndjson');
}

function exportAttemptJsonl() {
  const task = getCurrentTask();
  if (!task) {
    alert('请先选择任务。');
    return;
  }
  const book = getBook(task.bookId);
  const rows = buildTaskUnits(task).map(unit => {
    const attempt = getAttemptByKey(buildAttemptKey(task.bookId, task.id, unit.copyId, unit.pageNo));
    return attempt ? JSON.stringify(exportAttemptRecord(task, book, attempt)) : null;
  }).filter(Boolean);
  downloadTextFile(`${task.id}.attempt.jsonl`, rows.join('\n'), 'application/x-ndjson');
}

function buildTaskTemplateRecords(task, book) {
  const rows = [];
  const pageSet = new Set(buildTaskUnits(task).map(unit => unit.pageNo));
  Array.from(pageSet).sort((a, b) => a - b).forEach(pageNo => {
    const template = getTemplate(task.bookId, pageNo);
    if (!template) return;
    rows.push({
      record_type: 'template',
      project_name: state.project.projectName,
      task_id: task.id,
      book_id: task.bookId,
      book_label: book?.label || task.bookId,
      page_no: pageNo,
      image_path_pattern: `${book?.folderName || task.bookId}/*/${padPage(pageNo, book?.pageDigits || 4)}.${book?.imageExt || 'png'}`,
      source_copy_id: template.sourceCopyId,
      questions: template.questions.map(question => exportTemplateQuestion(question))
    });
  });
  return rows;
}

function exportAttemptRecord(task, book, attempt) {
  return {
    record_type: 'attempt',
    project_name: state.project.projectName,
    task_id: task.id,
    book_id: attempt.bookId,
    book_label: book?.label || attempt.bookId,
    copy_id: attempt.copyId,
    page_no: attempt.pageNo,
    image_path: buildImageRelativePath(book, attempt.copyId, attempt.pageNo),
    page_status: attempt.pageStatus,
    detached_from_template: !!attempt.detachedFromTemplate,
    template_offset: attempt.templateOffset || { x: 0, y: 0 },
    questions: attempt.questions.map(question => exportAttemptQuestion(question, attempt.templateOffset || { x: 0, y: 0 }))
  };
}

function exportTemplateQuestion(question) {
  return {
    question_id: question.questionId,
    order: question.order,
    type: question.type,
    type_label: typeConfig[question.type]?.label || question.type,
    stem_bbox: question.stem ? question.stem.bbox : null,
    total_score: question.totalScore || null,
    answer_key: question.answer_key || null,
    answer_key_images_count: (question.answer_key_images || []).length,
    sub_questions: (question.subQuestions || []).map(subQuestion => ({
      sub_question_id: subQuestion.subQuestionId,
      order: subQuestion.order,
      stem_bbox: subQuestion.stem ? subQuestion.stem.bbox : null,
      total_score: subQuestion.totalScore || null,
      answer_key: subQuestion.answer_key || null,
      answer_key_images_count: (subQuestion.answer_key_images || []).length
    }))
  };
}

function exportAttemptQuestion(question, offset) {
  return {
    question_id: question.questionId,
    order: question.order,
    type: question.type,
    stem_bbox: question.stem ? applyOffsetToBbox(question.stem.bbox, offset) : null,
    answer_bbox: question.answer ? question.answer.bbox : null,
    status: question.status,
    total_score: question.totalScore || null,
    student_score: question.studentScore || null,
    note: question.note || '',
    answer_key: question.answer_key || null,
    answer_key_images_count: (question.answer_key_images || []).length,
    student_answer: question.student_answer || null,
    student_answer_images_count: (question.student_answer_images || []).length,
    sub_questions: (question.subQuestions || []).map(subQuestion => ({
      sub_question_id: subQuestion.subQuestionId,
      order: subQuestion.order,
      stem_bbox: subQuestion.stem ? applyOffsetToBbox(subQuestion.stem.bbox, offset) : null,
      answer_bbox: subQuestion.answer ? subQuestion.answer.bbox : null,
      status: subQuestion.status,
      total_score: subQuestion.totalScore || null,
      student_score: subQuestion.studentScore || null,
      note: subQuestion.note || '',
      answer_key: subQuestion.answer_key || null,
      answer_key_images_count: (subQuestion.answer_key_images || []).length,
      student_answer: subQuestion.student_answer || null,
      student_answer_images_count: (subQuestion.student_answer_images || []).length
    }))
  };
}

function buildTextAndImageAnswerEditor(container, target, keyField, imageField, placeholder, editable) {
  target[imageField] = target[imageField] || [];
  const textInput = document.createElement('textarea');
  textInput.className = 'note-input';
  textInput.placeholder = placeholder;
  textInput.value = target[keyField] || '';
  textInput.disabled = !editable;
  textInput.addEventListener('input', function() {
    target[keyField] = this.value;
    touchCurrentAttempt();
  });
  container.appendChild(textInput);

  if (editable) {
    buildMathSymbolToolbar(container, textInput, value => {
      target[keyField] = value;
      touchCurrentAttempt();
    });
  }

  const uploadLabel = document.createElement('label');
  uploadLabel.className = 'mini-btn';
  uploadLabel.textContent = editable ? '上传图片' : '标准答案图片';
  if (!editable) uploadLabel.style.cursor = 'default';

  if (editable) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    fileInput.addEventListener('change', event => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(loadEvent) {
        target[imageField].push(loadEvent.target.result);
        touchCurrentAttempt();
        renderAnnotationsList();
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    });
    uploadLabel.appendChild(fileInput);
  }
  container.appendChild(uploadLabel);

  const thumbRow = document.createElement('div');
  thumbRow.className = 'thumb-row';
  (target[imageField] || []).forEach((src, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-wrap';
    const img = document.createElement('img');
    img.src = src;
    img.addEventListener('click', () => previewImage(src));
    wrap.appendChild(img);
    if (editable) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        target[imageField].splice(index, 1);
        touchCurrentAttempt();
        renderAnnotationsList();
      });
      wrap.appendChild(delBtn);
    }
    thumbRow.appendChild(wrap);
  });
  container.appendChild(thumbRow);
}

function buildOptionAnswerSelector(container, target, fieldName, allowMultiple, editable) {
  const optionRow = document.createElement('div');
  optionRow.className = 'option-row';
  const selected = (target[fieldName] || '').split('').filter(Boolean);
  ['A', 'B', 'C', 'D', 'E'].forEach(option => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `option-btn ${selected.includes(option) ? 'active' : ''}`;
    btn.textContent = option;
    btn.disabled = !editable;
    btn.addEventListener('click', () => {
      let nextValues = (target[fieldName] || '').split('').filter(Boolean);
      if (!allowMultiple) {
        nextValues = nextValues.includes(option) ? [] : [option];
      } else if (nextValues.includes(option)) {
        nextValues = nextValues.filter(item => item !== option);
      } else {
        nextValues.push(option);
        nextValues.sort();
      }
      target[fieldName] = nextValues.join('');
      touchCurrentAttempt();
      renderAnnotationsList();
    });
    optionRow.appendChild(btn);
  });
  container.appendChild(optionRow);
}

function buildMathSymbolToolbar(container, textInput, onChange) {
  const toolbar = document.createElement('div');
  toolbar.className = 'math-symbol-toolbar';
  mathSymbols.forEach(symbol => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'math-symbol-btn';
    btn.textContent = symbol;
    btn.addEventListener('click', event => {
      event.stopPropagation();
      insertTextAtCursor(textInput, symbol, onChange);
    });
    toolbar.appendChild(btn);
  });
  container.appendChild(toolbar);
}

function insertTextAtCursor(textInput, text, onChange) {
  const start = textInput.selectionStart ?? textInput.value.length;
  const end = textInput.selectionEnd ?? textInput.value.length;
  textInput.value = textInput.value.slice(0, start) + text + textInput.value.slice(end);
  const nextPos = start + text.length;
  textInput.focus();
  textInput.setSelectionRange(nextPos, nextPos);
  onChange(textInput.value);
}

function previewImage(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;';
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:10px;background:white;';
  overlay.appendChild(img);
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function updateDisplaySize() {
  state.displayW = elements.mainImage.offsetWidth;
  state.displayH = elements.mainImage.offsetHeight;
  applyImageZoomStyle();
}

function displayToImageBbox(region) {
  const scaleX = state.imageNaturalW / state.displayW;
  const scaleY = state.imageNaturalH / state.displayH;
  return {
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    w: Math.round(region.w * scaleX),
    h: Math.round(region.h * scaleY)
  };
}

function applyOffsetToBbox(bbox, offset) {
  const scaleX = state.imageNaturalW / state.displayW;
  const scaleY = state.imageNaturalH / state.displayH;
  return {
    x: Math.round(bbox.x + offset.x * scaleX),
    y: Math.round(bbox.y + offset.y * scaleY),
    w: bbox.w,
    h: bbox.h
  };
}

function shiftRegion(region, offset) {
  return {
    x: region.x + offset.x,
    y: region.y + offset.y,
    w: region.w,
    h: region.h
  };
}

function buildImageRelativePath(book, copyId, pageNo) {
  const copy = getCopy(book, copyId);
  const digits = book?.pageDigits || 4;
  const ext = book?.imageExt || 'png';
  return `${book?.folderName || book?.id}/${copy?.folderName || copyId}/${padPage(pageNo, digits)}.${ext}`;
}

function resolveCurrentImageFile() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  const book = getBook(task?.bookId);
  if (!task || !unit || !book) return null;
  const expectedPath = buildImageRelativePath(book, unit.copyId, unit.pageNo);
  return resolveFileByPath(expectedPath);
}

function resolveFileByPath(expectedPath) {
  if (!state.fileRecords.length) return null;
  const normalizedExpected = expectedPath.replace(/\\/g, '/');
  return (state.fileRecords.find(record => record.relativePath.endsWith(normalizedExpected)) || {}).file || null;
}

function validateProjectConfig(project) {
  if (!project || typeof project !== 'object') {
    throw new Error('配置内容不是有效对象。');
  }
  ['projectName', 'annotators', 'books', 'tasks'].forEach(key => {
    if (!(key in project)) throw new Error(`缺少字段：${key}`);
  });
}

function getTasksForCurrentAnnotator() {
  return (state.project.tasks || []).filter(task => task.annotatorId === state.annotatorId);
}

function getCurrentAnnotator() {
  return (state.project.annotators || []).find(item => item.id === state.annotatorId) || null;
}

function getCurrentTask() {
  return (state.project.tasks || []).find(item => item.id === state.activeTaskId) || null;
}

function getCurrentUnit() {
  return state.currentTaskUnits[state.currentTaskUnitIndex] || null;
}

function getBook(bookId) {
  return (state.project.books || []).find(item => item.id === bookId) || null;
}

function getCopy(book, copyId) {
  return (book?.copies || []).find(item => item.id === copyId) || null;
}

function getTemplate(bookId, pageNo) {
  return state.workbench.templates[buildTemplateKey(bookId, pageNo)] || null;
}

function getAttemptByKey(key) {
  return state.workbench.attempts[key] || null;
}

function getCurrentAttempt() {
  const task = getCurrentTask();
  const unit = getCurrentUnit();
  if (!task || !unit) return null;
  return state.workbench.attempts[buildAttemptKey(task.bookId, task.id, unit.copyId, unit.pageNo)] || null;
}

function isTemplateMode() {
  return !!getCurrentAttempt()?.templateMode;
}

function isCurrentImageReady() {
  return !!elements.mainImage.src && !elements.imageContainer.classList.contains('hidden');
}

function buildQuestionId(bookId, pageNo, order) {
  return `${bookId}__p${padPage(pageNo)}__q${String(order).padStart(2, '0')}`;
}

function buildTemplateKey(bookId, pageNo) {
  return `${bookId}__${pageNo}`;
}

function buildAttemptKey(bookId, taskId, copyId, pageNo) {
  return `${bookId}__${pageNo}__${copyId}__${taskId}`;
}

function padPage(pageNo, digits = 4) {
  return String(pageNo).padStart(digits, '0');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = function() {
      resolve(request.result);
    };
    request.onerror = function() {
      reject(request.error);
    };
  });
}

function dbGet(key) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const request = store.get(key);
    request.onsuccess = function() { resolve(request.result); };
    request.onerror = function() { reject(request.error); };
  });
}

function dbSet(key, value) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const request = store.put(value, key);
    request.onsuccess = function() { resolve(); };
    request.onerror = function() { reject(request.error); };
  });
}
