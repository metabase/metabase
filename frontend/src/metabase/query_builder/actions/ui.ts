import { createAction } from "redux-actions";

import { updateSetting } from "metabase/admin/settings/settings";
import { getOriginalCard } from "metabase/query_builder/selectors";
import { updateUserSetting } from "metabase/redux/settings";
import type { Card } from "metabase-types/api";
import type {
  DatasetEditorTab,
  Dispatch,
  GetState,
  QueryBuilderMode,
} from "metabase-types/store";

import { trackFirstNonTableChartGenerated } from "../analytics";

import { updateUrl } from "./url";

const CANCEL_QUERY = "metabase/qb/CANCEL_QUERY";

export const SET_UI_CONTROLS = "metabase/qb/SET_UI_CONTROLS";
export const setUIControls = createAction(SET_UI_CONTROLS);

export const RESET_UI_CONTROLS = "metabase/qb/RESET_UI_CONTROLS";
export const resetUIControls = createAction(RESET_UI_CONTROLS);

export const setQueryBuilderMode =
  (
    queryBuilderMode: QueryBuilderMode,
    {
      shouldUpdateUrl = true,
      datasetEditorTab = "query",
      replaceState,
    }: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
      replaceState?: boolean;
    } = {},
  ) =>
  async (dispatch: Dispatch) => {
    await dispatch(
      setUIControls({
        queryBuilderMode,
        datasetEditorTab,
        isShowingChartSettingsSidebar: false,
      }),
    );
    if (shouldUpdateUrl) {
      await dispatch(
        updateUrl(null, { queryBuilderMode, datasetEditorTab, replaceState }),
      );
    }
    if (queryBuilderMode === "notebook") {
      dispatch({ type: CANCEL_QUERY });
    }
  };

export const ON_EDIT_SUMMARY = "metabase/qb/ON_EDIT_SUMMARY";
export const onEditSummary = createAction(ON_EDIT_SUMMARY);

export const ON_CLOSE_SUMMARY = "metabase/qb/ON_CLOSE_SUMMARY";
export const onCloseSummary = createAction(ON_CLOSE_SUMMARY);

export const OPEN_AI_QUESTION_ANALYSIS_SIDEBAR =
  "metabase/qb/OPEN_AI_QUESTION_ANALYSIS_SIDEBAR";
export const onOpenAIQuestionAnalysisSidebar = createAction(
  OPEN_AI_QUESTION_ANALYSIS_SIDEBAR,
);

export const CLOSE_AI_QUESTION_ANALYSIS_SIDEBAR =
  "metabase/qb/CLOSE_AI_QUESTION_ANALYSIS_SIDEBAR";
export const onCloseAIQuestionAnalysisSidebar = createAction(
  CLOSE_AI_QUESTION_ANALYSIS_SIDEBAR,
);

export const OPEN_CHART_SETTINGS = "metabase/qb/OPEN_CHART_SETTINGS";
export const onOpenChartSettings = createAction(OPEN_CHART_SETTINGS);

export const CLOSE_CHART_SETTINGS = "metabase/qb/CLOSE_CHART_SETTINGS";
export const onCloseChartSettings = createAction(CLOSE_CHART_SETTINGS);

export const OPEN_CHART_TYPE = "metabase/qb/OPEN_CHART_TYPE";
export const onOpenChartType = createAction(OPEN_CHART_TYPE);

export const OPEN_QUESTION_INFO = "metabase/qb/OPEN_QUESTION_INFO";
export const onOpenQuestionInfo = createAction(OPEN_QUESTION_INFO);

export const CLOSE_QUESTION_INFO = "metabase/qb/CLOSE_QUESTION_INFO";
export const onCloseQuestionInfo = createAction(CLOSE_QUESTION_INFO);

export const OPEN_QUESTION_SETTINGS = "metabase/qb/OPEN_QUESTION_SETTINGS";
export const onOpenQuestionSettings = createAction(OPEN_QUESTION_SETTINGS);

export const CLOSE_QUESTION_SETTINGS = "metabase/qb/CLOSE_QUESTION_SETTINGS";
export const onCloseQuestionSettings = createAction(CLOSE_QUESTION_SETTINGS);

export const OPEN_TIMELINES = "metabase/qb/OPEN_TIMELINES";
export const onOpenTimelines = createAction(OPEN_TIMELINES);

export const CLOSE_TIMELINES = "metabase/qb/CLOSE_TIMELINES";
export const onCloseTimelines = createAction(CLOSE_TIMELINES);

export const CLOSE_CHART_TYPE = "metabase/qb/CLOSE_CHART_TYPE";
export const onCloseChartType = createAction(CLOSE_CHART_TYPE);

export const CLOSE_SIDEBARS = "metabase/qb/CLOSE_SIDEBARS";
export const onCloseSidebars = createAction(CLOSE_SIDEBARS);

export const SHOW_CHART_SETTINGS = "metabase/qb/SHOW_CHART_SETTINGS";
export const showChartSettings = createAction(SHOW_CHART_SETTINGS);

export const NAVIGATE_BACK_TO_DASHBOARD =
  "metabase/qb/NAVIGATE_BACK_TO_DASHBOARD";
export const navigateBackToDashboard = createAction(NAVIGATE_BACK_TO_DASHBOARD);

export const CLOSE_QB = "metabase/qb/CLOSE_QB";
export const closeQB = createAction(CLOSE_QB);

export const setDidFirstNonTableChartRender = (card: Card) => {
  trackFirstNonTableChartGenerated(card);
  return updateSetting({
    key: "non-table-chart-generated",
    value: true,
  });
};

export const setNotebookNativePreviewSidebarWidth = (width: number) =>
  updateUserSetting({
    key: "notebook-native-preview-sidebar-width",
    value: width,
  });

export const CANCEL_QUESTION_CHANGES = "metabase/qb/CANCEL_QUESTION_CHANGES";
export const cancelQuestionChanges =
  () => (dispatch: Dispatch, getState: GetState) => {
    const cardBeforeChanges = getOriginalCard(getState());
    dispatch({
      type: CANCEL_QUESTION_CHANGES,
      payload: { card: cardBeforeChanges },
    });
  };
