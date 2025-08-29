import type {
  QueryBuilderParentEntityState,
  QueryBuilderState,
  QueryBuilderUIControls,
} from "metabase-types/store";

export const createMockQueryBuilderUIControls = (
  opts: Partial<QueryBuilderUIControls> = {},
): QueryBuilderUIControls => ({
  isModifiedFromNotebook: false,
  isShowingDataReference: false,
  isShowingTemplateTagsEditor: false,
  isShowingNewbModal: false,
  isRunning: false,
  isShowingSummarySidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingQuestionDetailsSidebar: false,
  isShowingQuestionInfoSidebar: false,
  isShowingSnippetSidebar: false,
  isShowingColumnPickerSidebar: false,
  activeColumnPickerStepId: null,
  isShowingTimelineSidebar: false,
  isNativeEditorOpen: false,
  isShowingAIQuestionAnalysisSidebar: false,
  initialChartSetting: {},
  isShowingRawTable: false,
  queryBuilderMode: "view",
  previousQueryBuilderMode: false,
  snippetCollectionId: null,
  datasetEditorTab: "query",
  isShowingNotebookNativePreview: false,
  notebookNativePreviewSidebarWidth: null,
  showSidebarTitle: false,
  modal: null,
  modalContext: null,
  dataReferenceStack: null,
  highlightedNativeQueryLineNumbers: [],
  openColumnPickerId: null,
  activeSidebar: null,
  ...opts,
});

export const createMockQueryBuilderParentEntityState = (
  opts?: Partial<QueryBuilderParentEntityState>,
): QueryBuilderParentEntityState => ({
  id: null,
  model: null,
  name: null,
  isEditing: false,
  ...opts,
});

export const createMockQueryBuilderState = (
  opts?: Partial<QueryBuilderState>,
): QueryBuilderState => ({
  uiControls: createMockQueryBuilderUIControls(),
  loadingControls: {
    showLoadCompleteFavicon: false,
    documentTitle: "",
    timeoutId: "",
  },
  parentEntity: createMockQueryBuilderParentEntityState(),

  queryStatus: "complete",
  queryResults: null,
  queryStartTime: null,
  cancelQueryDeferred: null,

  card: null,
  originalCard: null,
  lastRunCard: null,

  parameterValues: {},

  zoomedRowObjectId: null,
  tableForeignKeyReferences: null,

  selectedTimelineEventIds: [],

  metadataDiff: {},

  currentState: null,

  ...opts,
});
