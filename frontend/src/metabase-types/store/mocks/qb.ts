import type {
  QueryBuilderDashboardState,
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
  isQueryComplete: false,
  isShowingSummarySidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingQuestionDetailsSidebar: false,
  isShowingQuestionInfoSidebar: false,
  isShowingSnippetSidebar: false,
  isShowingTimelineSidebar: false,
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
  ...opts,
});

export const createMockQueryBuilderDashboardState = (
  opts?: Partial<QueryBuilderDashboardState>,
): QueryBuilderDashboardState => ({
  dashboardId: null,
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
  parentDashboard: createMockQueryBuilderDashboardState(),

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
