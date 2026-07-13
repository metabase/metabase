import _ from "underscore";

import type { Dispatch, GetState } from "metabase/redux/store";
import { getReferencedCardsFromVizSettings } from "metabase/visualizations/lib/dynamic-goals";
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

    // Dynamic goals resolved by the backend during query execution, so re-run
    // the query whenever the set of referenced cards/columns changes.
    const referencedCardsChanged = !_.isEqual(
      getReferencedCardsFromVizSettings(question.settings()),
      getReferencedCardsFromVizSettings(updatedQuestion.settings()),
    );

    // The check allows users without data permission to resize/rearrange columns
    const { isEditable } = Lib.queryDisplayInfo(question.query());
    await dispatch(
      updateQuestion(updatedQuestion, {
        run: referencedCardsChanged,
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

      // Dynamic goals resolved by the backend during query execution, so re-run
      // the query whenever the set of referenced cards/columns changes.
      const referencedCardsChanged =
        currentQuestion != null &&
        !_.isEqual(
          getReferencedCardsFromVizSettings(currentQuestion.settings()),
          getReferencedCardsFromVizSettings(updatedQuestion.settings()),
        );

      await dispatch(
        updateQuestion(updatedQuestion, {
          // rerun the query when it is changed alongside settings, or when a
          // dynamic goal reference changed
          run:
            hasWritePermissions &&
            (newQuestion != null || referencedCardsChanged),
          shouldUpdateUrl: hasWritePermissions,
        }),
      );
    }
  };
