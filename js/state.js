const STORAGE_KEYS = {
  annotatorId: 'annotation_workbench_annotator_id',
  activeTaskId: 'annotation_workbench_active_task_id',
  projectConfig: 'annotation_workbench_project_config'
};

const DB_NAME = 'annotation-workbench-db';
const DB_VERSION = 1;
const DB_STORE = 'kv';

const PAGE_STATUSES = [
  { id: 'not_started', label: '未开始' },
  { id: 'in_progress', label: '进行中' },
  { id: 'completed', label: '已完成' }
];

const typeConfig = {
  single:   { label: '单选题', colorClass: 'color-single', borderColor: '#1665a8', statuses: ['correct', 'wrong'] },
  multiple: { label: '多选题', colorClass: 'color-multiple', borderColor: '#9447b8', statuses: ['correct', 'wrong', 'partial'] },
  fill:     { label: '填空题', colorClass: 'color-fill', borderColor: '#d98b22', statuses: ['correct', 'wrong', 'partial'] },
  qa:       { label: '问答题', colorClass: 'color-qa', borderColor: '#19837b', statuses: ['correct', 'wrong', 'partial', 'blank'] }
};

const statusConfig = {
  correct: { label: '正确' },
  wrong:   { label: '错误' },
  partial: { label: '部分正确' },
  blank:   { label: '空白' }
};

const mathSymbols = ['±', '×', '÷', '√', '∠', '≠', '≈', '≤', '≥', 'π', '∞', '△', '□', '∵', '∴', 'sin', 'cos', 'tan', '°', '℃'];

const DEFAULT_PROJECT = {
  projectName: '练习册标注试运行项目',
  annotators: [
    { id: '001', label: '标注员01' },
    { id: '002', label: '标注员02' }
  ],
  books: [
    {
      id: 'book_a',
      label: '书A',
      folderName: '书A',
      pageCount: 20,
      pageDigits: 4,
      imageExt: 'png',
      copies: [
        { id: '学生01', label: '学生01', folderName: '学生01' },
        { id: '学生02', label: '学生02', folderName: '学生02' },
        { id: '学生03', label: '学生03', folderName: '学生03' }
      ]
    }
  ],
  tasks: [
    {
      id: 'task_book_a_0001_0020',
      title: '书A 第1-20页',
      annotatorId: '001',
      bookId: 'book_a',
      pageStart: 1,
      pageEnd: 20,
      copyIds: ['学生01', '学生02', '学生03']
    }
  ]
};

const DEFAULT_PROJECT_CONFIG_TEXT = JSON.stringify(DEFAULT_PROJECT, null, 2);

const state = {
  project: DEFAULT_PROJECT,
  annotatorId: '',
  activeTaskId: '',
  fileRecords: [],
  workbench: {
    templates: {},
    attempts: {},
    taskCursor: {}
  },
  currentType: 'single',
  selectedQuestionId: null,
  currentTaskUnitIndex: 0,
  currentTaskUnits: [],
  imageNaturalW: 0,
  imageNaturalH: 0,
  displayW: 0,
  displayH: 0,
  isDrawing: false,
  startX: 0,
  startY: 0,
  drawingPhase: null,
  pendingQuestion: null,
  pendingSubQuestion: null,
  pendingSubQuestionParentId: null,
  pendingAnswerTarget: null,
  activeRegionId: 'sidebar-region',
  regionZoom: {
    'sidebar-region': 1,
    'image-region': 1,
    'detail-region': 1
  },
  saveTimeout: null,
  db: null
};

const elements = {};
