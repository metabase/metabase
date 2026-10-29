import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { currentUserApi, getUser } from "metabase/current-user";
import { createThunkAction } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import type {
  DatasetEditorTab,
  Dispatch,
  GetState,
  QueryBuilderMode,
} from "metabase/redux/store";
import { settingsApi } from "metabase/settings";
import { checkNotNull } from "metabase/utils/types";
import type { VisualizationDisplay } from "metabase-types/api";

import { trackFirstNonTableChartGenerated } from "../analytics";
import {
  CANCEL_QUERY,
  CANCEL_QUESTION_CHANGES,
  CLOSE_QB_NEWB_MODAL,
} from "../store/actions";
import { getOriginalCard } from "../store/question-selectors";

import { updateUrl } from "./url";

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

export const setDidFirstNonTableChartRender = (
  display: VisualizationDisplay,
) => {
  trackFirstNonTableChartGenerated(display);
  return settingsApi.endpoints.updateSetting.initiate({
    key: "non-table-chart-generated",
    value: true,
  });
};

export const setNotebookNativePreviewSidebarWidth = (width: number) =>
  settingsApi.endpoints.updateSetting.initiate({
    key: "notebook-native-preview-sidebar-width",
    value: width,
  });

export const cancelQuestionChanges =
  () => (dispatch: Dispatch, getState: GetState) => {
    const cardBeforeChanges = getOriginalCard(getState());
    dispatch({
      type: CANCEL_QUESTION_CHANGES,
      payload: { card: cardBeforeChanges },
    });
  };

export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
  return async (dispatch, getState) => {
    const user = checkNotNull(getUser(getState()));
    await runRtkEndpoint(
      user.id,
      dispatch,
      currentUserApi.endpoints.updateUserModalQbnewb,
    );
  };
});
