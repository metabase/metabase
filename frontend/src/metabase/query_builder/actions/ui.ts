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

export const onEditSummary = createAction("metabase/qb/EDIT_SUMMARY");
export const onCloseSummary = createAction("metabase/qb/CLOSE_SUMMARY");

export const onOpenAIQuestionAnalysisSidebar = createAction(
  "metabase/qb/OPEN_AI_QUESTION_ANALYSIS_SIDEBAR",
);
export const onCloseAIQuestionAnalysisSidebar = createAction(
  "metabase/qb/CLOSE_AI_QUESTION_ANALYSIS_SIDEBAR",
);

export const onOpenChartSettings = createAction(
  "metabase/qb/OPEN_CHART_SETTINGS",
);
export const onCloseChartSettings = createAction(
  "metabase/qb/CLOSE_CHART_SETTINGS",
);
export const onOpenChartType = createAction("metabase/qb/OPEN_CHART_TYPE");

export const onOpenQuestionInfo = createAction(
  "metabase/qb/OPEN_QUESTION_INFO",
);
export const onCloseQuestionInfo = createAction(
  "metabase/qb/CLOSE_QUESTION_INFO",
);

export const onOpenQuestionSettings = createAction(
  "metabase/qb/OPEN_QUESTION_SETTINGS",
);
export const onCloseQuestionSettings = createAction(
  "metabase/qb/CLOSE_QUESTION_SETTINGS",
);

export const onOpenTimelines = createAction("metabase/qb/OPEN_TIMELINES");
export const onCloseTimelines = createAction("metabase/qb/CLOSE_TIMELINES");

export const onCloseChartType = createAction("metabase/qb/CLOSE_CHART_TYPE");
export const onCloseSidebars = createAction("metabase/qb/CLOSE_SIDEBARS");

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
