import { t } from "ttag";

import type {
  QueryBuilderDashboardState,
  QueryBuilderLoadingControls,
  QueryBuilderUIControls,
} from "metabase-types/store";

export const DEFAULT_UI_CONTROLS: QueryBuilderUIControls = {
  initialChartSettings: { section: t`Data` },
  showSidebarTitle: true,
  isShowingNotebookNativePreview: false,
  isShowingQuestionDetailsSidebar: false,
  modal: null,
  notebookNativePreviewSidebarWidth: null,
  scrollToLastColumn: false,
  dataReferenceStack: null,
  isModifiedFromNotebook: false,
  isShowingDataReference: false,
  isShowingTemplateTagsEditor: false,
  isShowingNewbModal: false,
  isRunning: false,
  isQueryComplete: false,
  isShowingSummarySidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingQuestionInfoSidebar: false,
  isShowingTimelineSidebar: false,
  isNativeEditorOpen: false,
  initialChartSetting: null,
  isShowingRawTable: false, // table/viz toggle
  queryBuilderMode: false, // "view" | "notebook" | "dataset"
  previousQueryBuilderMode: false,
  snippetCollectionId: null,
  datasetEditorTab: "query", // "query" / "metadata"
};

export const DEFAULT_LOADING_CONTROLS: QueryBuilderLoadingControls = {
  showLoadCompleteFavicon: false,
  documentTitle: "",
  timeoutId: "",
};

export const DEFAULT_DASHBOARD_STATE: QueryBuilderDashboardState = {
  dashboardId: null,
  isEditing: false,
};

export const DEFAULT_QUERY_STATUS = "idle";

export const UI_CONTROLS_SIDEBAR_DEFAULTS = {
  isShowingSummarySidebar: false,
  isShowingChartSettingsSidebar: false,
  isShowingChartTypeSidebar: false,
  isShowingTimelineSidebar: false,
  isShowingQuestionInfoSidebar: false,
};

// this is used to close other sidebar when one is updated
export const CLOSED_NATIVE_EDITOR_SIDEBARS = {
  isShowingTemplateTagsEditor: false,
  isShowingSnippetSidebar: false,
  isShowingDataReference: false,
  isShowingTimelineSidebar: false,
};
