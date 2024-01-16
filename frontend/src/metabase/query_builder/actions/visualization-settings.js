import * as Lib from "metabase-lib";
import {
  getDatasetEditorTab,
  getPreviousQueryBuilderMode,
  getQueryBuilderMode,
  getQuestion,
} from "../selectors";

import { updateQuestion } from "./core";

function isQuestionEditable(question) {
  const query = question.query();
  const { isEditable } = Lib.displayInfo(query, -1, query);
  return isEditable;
}

export const updateCardVisualizationSettings =
  settings => async (dispatch, getState) => {
    const question = getQuestion(getState());
    const previousQueryBuilderMode = getPreviousQueryBuilderMode(getState());
    const queryBuilderMode = getQueryBuilderMode(getState());
    const datasetEditorTab = getDatasetEditorTab(getState());
    const isEditingDatasetMetadata =
      queryBuilderMode === "dataset" && datasetEditorTab === "metadata";
    const wasJustEditingModel =
      previousQueryBuilderMode === "dataset" && queryBuilderMode !== "dataset";
    const changedSettings = Object.keys(settings);
    const isColumnWidthResetEvent =
      changedSettings.length === 1 &&
      changedSettings.includes("table.column_widths") &&
      settings["table.column_widths"] === undefined;

    if (
      (isEditingDatasetMetadata || wasJustEditingModel) &&
      isColumnWidthResetEvent
    ) {
      return;
    }

    // The check allows users without data permission to resize/rearrange columns
    const hasWritePermissions = isQuestionEditable(question);
    await dispatch(
      updateQuestion(question.updateSettings(settings), {
        shouldUpdateUrl: hasWritePermissions,
      }),
    );
  };

export const replaceAllCardVisualizationSettings =
  (settings, newQuestion) => async (dispatch, getState) => {
    const oldQuestion = getQuestion(getState());
    const updatedQuestion = (newQuestion ?? oldQuestion).setSettings(settings);
    const hasWritePermissions = isQuestionEditable(newQuestion);

    await dispatch(
      updateQuestion(updatedQuestion, {
        // rerun the query when it is changed alongside settings
        run: newQuestion != null && hasWritePermissions,
        shouldUpdateUrl: hasWritePermissions,
      }),
    );
  };

// these are just temporary mappings to appease the existing QB code and it's naming prefs
export const onUpdateVisualizationSettings = updateCardVisualizationSettings;
export const onReplaceAllVisualizationSettings =
  replaceAllCardVisualizationSettings;
