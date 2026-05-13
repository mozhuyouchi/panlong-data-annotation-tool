function startNewQuestionFlow(silent = false) {
  if (!isTemplateMode()) {
    if (!silent) alert('当前页模板已经存在，不能再新增模板题目。');
    return;
  }
  if (!isCurrentImageReady()) {
    if (!silent) alert('请先确保当前页图片已成功加载。');
    return;
  }
  state.pendingQuestion = {
    questionId: buildQuestionId(getCurrentTask().bookId, getUnitPageKey(getCurrentUnit()), getCurrentAttempt().questions.length + 1),
    order: getCurrentAttempt().questions.length + 1,
    type: state.currentType,
    stem: null,
    answer: null,
    status: null,
    totalScore: '',
    studentScore: '',
    note: '',
    answer_key: '',
    answer_key_images: [],
    student_answer: '',
    student_answer_images: [],
    subQuestions: state.currentType === 'qa' ? [] : null,
    fromTemplate: false
  };
  setDrawingPhase('template_stem');
}

function startTemplateSubQuestionDraw(questionId) {
  if (!isTemplateMode()) return;
  const question = getCurrentAttempt().questions.find(item => item.questionId === questionId);
  if (!question) return;
  state.pendingSubQuestionParentId = questionId;
  state.pendingSubQuestion = {
    subQuestionId: `${questionId}__s${String((question.subQuestions || []).length + 1).padStart(2, '0')}`,
    order: (question.subQuestions || []).length + 1,
    stem: null,
    answer: null,
    status: null,
    totalScore: '',
    studentScore: '',
    note: '',
    answer_key: '',
    answer_key_images: [],
    student_answer: '',
    student_answer_images: []
  };
  setDrawingPhase('sub_template_stem');
}

function startAttemptAnswerDraw(questionId) {
  if (isTemplateMode()) return;
  state.pendingAnswerTarget = { questionId, subQuestionId: null };
  setDrawingPhase('attempt_answer');
}

function startAttemptSubAnswerDraw(questionId, subQuestionId) {
  if (isTemplateMode()) return;
  state.pendingAnswerTarget = { questionId, subQuestionId };
  setDrawingPhase('attempt_sub_answer');
}

function handleDrawStart(event) {
  if (!isCurrentImageReady()) return;
  if (!state.drawingPhase && isTemplateMode()) {
    startNewQuestionFlow(true);
  }
  if (!state.drawingPhase) return;
  state.isDrawing = true;
  const rect = elements.imageContainer.getBoundingClientRect();
  const imageScale = state.regionZoom['image-region'] || 1;
  state.startX = (event.clientX - rect.left) / imageScale;
  state.startY = (event.clientY - rect.top) / imageScale;
  elements.drawingBox.style.display = 'block';
  elements.drawingBox.style.left = `${state.startX}px`;
  elements.drawingBox.style.top = `${state.startY}px`;
  elements.drawingBox.style.width = '0px';
  elements.drawingBox.style.height = '0px';
  event.preventDefault();
}

function handleDrawMove(event) {
  if (!state.isDrawing) return;
  const rect = elements.imageContainer.getBoundingClientRect();
  const imageScale = state.regionZoom['image-region'] || 1;
  const curX = Math.max(0, Math.min((event.clientX - rect.left) / imageScale, elements.imageContainer.offsetWidth));
  const curY = Math.max(0, Math.min((event.clientY - rect.top) / imageScale, elements.imageContainer.offsetHeight));
  const x = Math.min(state.startX, curX);
  const y = Math.min(state.startY, curY);
  const w = Math.abs(curX - state.startX);
  const h = Math.abs(curY - state.startY);
  elements.drawingBox.style.left = `${x}px`;
  elements.drawingBox.style.top = `${y}px`;
  elements.drawingBox.style.width = `${w}px`;
  elements.drawingBox.style.height = `${h}px`;
}

function handleDrawEnd(event) {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  elements.drawingBox.style.display = 'none';

  const rect = elements.imageContainer.getBoundingClientRect();
  const imageScale = state.regionZoom['image-region'] || 1;
  const curX = Math.max(0, Math.min((event.clientX - rect.left) / imageScale, elements.imageContainer.offsetWidth));
  const curY = Math.max(0, Math.min((event.clientY - rect.top) / imageScale, elements.imageContainer.offsetHeight));
  const x = Math.min(state.startX, curX);
  const y = Math.min(state.startY, curY);
  const w = Math.abs(curX - state.startX);
  const h = Math.abs(curY - state.startY);
  if (w < 10 || h < 10) return;

  updateDisplaySize();
  const regionDisplay = { x, y, w, h };
  const regionBbox = displayToImageBbox(regionDisplay);

  if (state.drawingPhase === 'template_stem') {
    state.pendingQuestion.stem = { display: regionDisplay, bbox: regionBbox };
    setDrawingPhase('template_answer');
  } else if (state.drawingPhase === 'template_answer') {
    state.pendingQuestion.answer = { display: regionDisplay, bbox: regionBbox };
    getCurrentAttempt().questions.push(state.pendingQuestion);
    selectQuestion(state.pendingQuestion.questionId);
    state.pendingQuestion = null;
    setDrawingPhase(null);
    touchCurrentAttempt();
  } else if (state.drawingPhase === 'sub_template_stem') {
    state.pendingSubQuestion.stem = { display: regionDisplay, bbox: regionBbox };
    setDrawingPhase('sub_template_answer');
  } else if (state.drawingPhase === 'sub_template_answer') {
    state.pendingSubQuestion.answer = { display: regionDisplay, bbox: regionBbox };
    const parent = getCurrentAttempt().questions.find(item => item.questionId === state.pendingSubQuestionParentId);
    if (parent) {
      parent.subQuestions.push(state.pendingSubQuestion);
      selectQuestion(parent.questionId);
      touchCurrentAttempt();
    }
    state.pendingSubQuestion = null;
    state.pendingSubQuestionParentId = null;
    setDrawingPhase(null);
  } else if (state.drawingPhase === 'attempt_answer') {
    const question = getCurrentAttempt().questions.find(item => item.questionId === state.pendingAnswerTarget.questionId);
    if (question) {
      question.answer = { display: regionDisplay, bbox: regionBbox };
      selectQuestion(question.questionId);
      touchCurrentAttempt();
    }
    state.pendingAnswerTarget = null;
    setDrawingPhase(null);
  } else if (state.drawingPhase === 'attempt_sub_answer') {
    const question = getCurrentAttempt().questions.find(item => item.questionId === state.pendingAnswerTarget.questionId);
    const subQuestion = question?.subQuestions?.find(item => item.subQuestionId === state.pendingAnswerTarget.subQuestionId);
    if (subQuestion) {
      subQuestion.answer = { display: regionDisplay, bbox: regionBbox };
      selectQuestion(question.questionId);
      touchCurrentAttempt();
    }
    state.pendingAnswerTarget = null;
    setDrawingPhase(null);
  }

  renderWorkspace();
}

function setDrawingPhase(phase) {
  state.drawingPhase = phase;
  const labelMap = {
    template_stem: '题干',
    template_answer: '当前副本作答区',
    sub_template_stem: '子题题干',
    sub_template_answer: '子题当前副本作答区',
    attempt_answer: '当前副本作答区',
    attempt_sub_answer: '子题当前副本作答区'
  };
  if (!phase) {
    elements.phaseHint.classList.add('hidden');
    return;
  }
  elements.phaseHint.classList.remove('hidden');
  elements.phaseHintText.textContent = labelMap[phase] || phase;
}
