import { createAction } from "redux-actions";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { createThunkAction } from "metabase/lib/redux";
import { UserApi } from "metabase/services";

import { cancelQuery } from "./querying";
import { updateUrl } from "./navigation";

export const SET_UI_CONTROLS = "metabase/qb/SET_UI_CONTROLS";
export const setUIControls = createAction(SET_UI_CONTROLS);

export const RESET_UI_CONTROLS = "metabase/qb/RESET_UI_CONTROLS";
export const resetUIControls = createAction(RESET_UI_CONTROLS);

export const setQueryBuilderMode =
  (
    queryBuilderMode,
    { shouldUpdateUrl = true, datasetEditorTab = "query" } = {},
  ) =>
  async dispatch => {
    await dispatch(
      setUIControls({
        queryBuilderMode,
        datasetEditorTab,
        isShowingChartSettingsSidebar: false,
      }),
    );
    if (shouldUpdateUrl) {
      await dispatch(updateUrl(null, { queryBuilderMode, datasetEditorTab }));
    }
    if (queryBuilderMode === "notebook") {
      dispatch(cancelQuery());
    }
  };

export const onEditSummary = createAction("metabase/qb/EDIT_SUMMARY");
export const onCloseSummary = createAction("metabase/qb/CLOSE_SUMMARY");

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

export const onOpenTimelines = createAction("metabase/qb/OPEN_TIMELINES");
export const onCloseTimelines = createAction("metabase/qb/CLOSE_TIMELINES");

export const onCloseChartType = createAction("metabase/qb/CLOSE_CHART_TYPE");
export const onCloseSidebars = createAction("metabase/qb/CLOSE_SIDEBARS");

export const CLOSE_QB_NEWB_MODAL = "metabase/qb/CLOSE_QB_NEWB_MODAL";
export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
  return async (dispatch, getState) => {
    // persist the fact that this user has seen the NewbModal
    const { currentUser } = getState();
    await UserApi.update_qbnewb({ id: currentUser.id });
    MetabaseAnalytics.trackStructEvent("QueryBuilder", "Close Newb Modal");
  };
});

export const SHOW_CHART_SETTINGS = "metabase/query_builder/SHOW_CHART_SETTINGS";
export const showChartSettings = createAction(SHOW_CHART_SETTINGS);

export const CLOSE_QB = "metabase/qb/CLOSE_QB";
export const closeQB = createAction(CLOSE_QB);
