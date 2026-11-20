import type { Dispatch, GetState } from "metabase/redux/store";
import { hasUnresolvedGoalReferences } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import {
  getDatasetEditorTab,
  getFirstQueryResult,
  getPreviousQueryBuilderMode,
  getQueryBuilderMode,
  getQuestion,
} from "../store/selectors";

import { updateQuestion } from "./core";

export const onUpdateVisualizationSettings =
  (settings: Partial<VisualizationSettings>) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());

    const previousQueryBuilderMode = getPreviousQueryBuilderMode(getState());
    const queryBuilderMode = getQueryBuilderMode(getState());
    const datasetEditorTab = getDatasetEditorTab(getState());
    const isEditingDatasetColumns =
      queryBuilderMode === "dataset" && datasetEditorTab === "columns";
    const wasJustEditingModel =
      previousQueryBuilderMode === "dataset" && queryBuilderMode !== "dataset";
    const changedSettings = Object.keys(settings);
    const isColumnWidthResetEvent =
      changedSettings.length === 1 &&
      changedSettings.includes("table.column_widths") &&
      settings["table.column_widths"] === undefined;

    if (
      !question ||
      ((isEditingDatasetColumns || wasJustEditingModel) &&
        isColumnWidthResetEvent)
    ) {
      return;
    }

    const updatedQuestion = question.updateSettings(settings);

    // The check allows users without data permission to resize/rearrange columns
    const { isEditable } = Lib.queryDisplayInfo(question.query());
    await dispatch(
      updateQuestion(updatedQuestion, {
        run:
          isEditable && shouldRunForGoalReferences(updatedQuestion, getState),
        shouldUpdateUrl: isEditable,
      }),
    );
  };

export const onReplaceAllVisualizationSettings =
  (settings: VisualizationSettings, newQuestion?: Question) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const currentQuestion = getQuestion(getState());
    const question = newQuestion ?? currentQuestion;
    if (question) {
      const updatedQuestion = question.setSettings(settings);
      const { isEditable } = Lib.queryDisplayInfo(updatedQuestion.query());
      const hasWritePermissions = isEditable;

      await dispatch(
        updateQuestion(updatedQuestion, {
          run:
            hasWritePermissions &&
            (newQuestion != null ||
              shouldRunForGoalReferences(updatedQuestion, getState)),
          shouldUpdateUrl: hasWritePermissions,
        }),
      );
    }
  };

function shouldRunForGoalReferences(
  question: Question,
  getState: GetState,
): boolean {
  const result = getFirstQueryResult(getState());
  return hasUnresolvedGoalReferences(question.card(), result?.data);
}
