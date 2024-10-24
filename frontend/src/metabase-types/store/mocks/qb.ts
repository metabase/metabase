import type {
  QueryBuilderDashboardState,
  QueryBuilderState,
  QueryBuilderUIControls,
} from "metabase-types/store";

export const createMockQueryBuilderUIControlsState = (
  opts?: Partial<QueryBuilderUIControls>,
): QueryBuilderUIControls => ({
  datasetEditorTab: "query",
  initialChartSetting: null,
  isModifiedFromNotebook: false,
  isNativeEditorOpen: false,
  isQueryComplete: false,
  isRunning: false,
  isShowingChartSettingsSidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingDataReference: false,
  isShowingNewbModal: false,
  isShowingNotebookNativePreview: false,
  isShowingQuestionDetailsSidebar: false,
  isShowingRawTable: false,
  isShowingSummarySidebar: false,
  isShowingTemplateTagsEditor: false,
  isShowingTimelineSidebar: false,
  notebookNativePreviewSidebarWidth: null,
  previousQueryBuilderMode: false,
  queryBuilderMode: "view",
  snippetCollectionId: null,
  isShowingQuestionInfoSidebar: false,
  modal: null,
  dataReferenceStack: null,
  initialChartSettings: undefined,
  showSidebarTitle: false,
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
