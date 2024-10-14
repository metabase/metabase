import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import {
  getDatasetEditorTab,
  getPreviousQueryBuilderMode,
  getQueryBuilderMode,
  getQuestion,
} from "../selectors";

import { updateQuestion } from "./core";

export const updateCardVisualizationSettings =
  (settings: VisualizationSettings) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

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
    const { isEditable } = Lib.queryDisplayInfo(question.query());
    const hasWritePermissions = isEditable;
    await dispatch(
      updateQuestion(question.updateSettings(settings), {
        shouldUpdateUrl: hasWritePermissions,
      }),
    );
  };

export const replaceAllCardVisualizationSettings =
  (settings: VisualizationSettings, newQuestion: Question) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const oldQuestion = getQuestion(getState());
    const updatedQuestion = (newQuestion ?? oldQuestion).setSettings(settings);
    const { isEditable } = Lib.queryDisplayInfo(updatedQuestion.query());
    const hasWritePermissions = isEditable;

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
