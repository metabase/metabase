import _ from "underscore";

import {
  getDatasetEditorTab,
  getPreviousQueryBuilderMode,
  getQueryBuilderMode,
  getQuestion,
} from "../selectors";

import { updateQuestion } from "./core";

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
    const hasWritePermissions = question.query().isEditable();
    await dispatch(
      updateQuestion(question.updateSettings(settings), {
        run: hasWritePermissions ? "auto" : false,
        shouldUpdateUrl: hasWritePermissions,
      }),
    );
  };

export const replaceAllCardVisualizationSettings =
  settings => async (dispatch, getState) => {
    const question = getQuestion(getState());

    // The check allows users without data permission to resize/rearrange columns
    const hasWritePermissions = question.query().isEditable();
    await dispatch(
      updateQuestion(question.setSettings(settings), {
        run: hasWritePermissions ? "auto" : false,
        shouldUpdateUrl: hasWritePermissions,
      }),
    );
  };

// these are just temporary mappings to appease the existing QB code and it's naming prefs
export const onUpdateVisualizationSettings = updateCardVisualizationSettings;
export const onReplaceAllVisualizationSettings =
  replaceAllCardVisualizationSettings;
