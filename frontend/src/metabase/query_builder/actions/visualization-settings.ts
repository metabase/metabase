import type { Dispatch, GetState } from "metabase/redux/store";
import { getReferencedEntitiesFromVizSettings } from "metabase/visualizations/lib/dynamic-goals";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import {
  getDatasetEditorTab,
  getPreviousQueryBuilderMode,
  getQueryBuilderMode,
  getQuestion,
} from "../selectors";

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
        run: referencesNewForeignColumn(question, updatedQuestion),
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
              (currentQuestion != null &&
                referencesNewForeignColumn(currentQuestion, updatedQuestion))),
          shouldUpdateUrl: hasWritePermissions,
        }),
      );
    }
  };

function referencesNewForeignColumn(
  previousQuestion: Question,
  nextQuestion: Question,
): boolean {
  const previousSettings = previousQuestion.settings();
  const nextSettings = nextQuestion.settings();
  const previousKeys = getReferencedColumnKeys(previousSettings);

  return Array.from(getReferencedColumnKeys(nextSettings)).some(
    (key) => !previousKeys.has(key),
  );
}

function getReferencedColumnKeys(settings: VisualizationSettings): Set<string> {
  return new Set(
    getReferencedEntitiesFromVizSettings(settings).flatMap(
      ({ type, id, columns = [] }) => {
        return columns.map((column) => `${type}:${id}:${column}`);
      },
    ),
  );
}
