import type {
  QueryBuilderParentEntityState,
  QueryBuilderState,
  QueryBuilderUIControls,
} from "metabase-types/store";

export const createMockQueryBuilderUIControlsState = (
  opts?: Partial<QueryBuilderUIControls>,
): QueryBuilderUIControls => ({
  isModifiedFromNotebook: false,
  isShowingDataReference: false,
  isShowingTemplateTagsEditor: false,
  isShowingNewbModal: false,
  isRunning: false,
  isShowingSummarySidebar: false,
  isShowingAISummarySidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingQuestionDetailsSidebar: false,
  isShowingQuestionInfoSidebar: false,
  isShowingSnippetSidebar: false,
  isShowingTimelineSidebar: false,
  isShowingAIQuestionAnalysisSidebar: false,
  initialChartSetting: {},
  isShowingRawTable: false,
  isNativeEditorOpen: false,
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
  isShowingListViewConfiguration: false,
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
  uiControls: createMockQueryBuilderUIControlsState(),
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
