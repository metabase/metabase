import { getOriginalCard } from "metabase/query_builder/selectors";
import {
  CANCEL_QUERY,
  CANCEL_QUESTION_CHANGES,
  setUIControls,
} from "metabase/redux/query-builder";
import { updateSetting, updateUserSetting } from "metabase/redux/settings";
import type {
  DatasetEditorTab,
  Dispatch,
  GetState,
  QueryBuilderMode,
} from "metabase/redux/store";
import type { Card } from "metabase-types/api";

import { trackFirstNonTableChartGenerated } from "../analytics";

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

export const cancelQuestionChanges =
  () => (dispatch: Dispatch, getState: GetState) => {
    const cardBeforeChanges = getOriginalCard(getState());
    dispatch({
      type: CANCEL_QUESTION_CHANGES,
      payload: { card: cardBeforeChanges },
    });
  };
