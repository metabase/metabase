import {
  QueryBuilderDashboardControls,
  QueryBuilderState,
  QueryBuilderUIControls,
} from "metabase-types/store";

export const createMockQueryBuilderUIControlsState = (
  opts?: Partial<QueryBuilderUIControls>,
): QueryBuilderUIControls => ({
  isShowingDataReference: false,
  isShowingTemplateTagsEditor: false,
  isShowingNewbModal: false,
  isRunning: false,
  isQueryComplete: false,
  isShowingSummarySidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingQuestionDetailsSidebar: false,
  isShowingTimelineSidebar: false,
  initialChartSetting: null,
  isShowingRawTable: false,
  isNativeEditorOpen: false,
  queryBuilderMode: "view",
  previousQueryBuilderMode: false,
  snippetCollectionId: null,
  datasetEditorTab: "query",
  ...opts,
});

export const createMockQueryBuilderDashboardControls = (
  opts?: Partial<QueryBuilderDashboardControls>,
): QueryBuilderDashboardControls => ({
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
  dashboardControls: createMockQueryBuilderDashboardControls(),

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
