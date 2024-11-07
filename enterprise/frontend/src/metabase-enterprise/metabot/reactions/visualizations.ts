import { t } from "ttag";

import {
  onUpdateVisualizationSettings,
  setUIControls,
  updateQuestion,
} from "metabase/query_builder/actions";
import { setQuestionDisplayType } from "metabase/query_builder/components/chart-type-selector";
import { getQueryResults, getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type {
  MetabotChangeAxesLabelsReaction,
  MetabotChangeDisplayTypeReaction,
  MetabotChangeVisiualizationSettingsReaction,
} from "metabase-types/api";

import { stopProcessingAndNotify } from "../state";

import type { ReactionHandler } from "./types";

export const changeTableVisualizationSettings: ReactionHandler<
  MetabotChangeVisiualizationSettingsReaction
> =
  reaction =>
  async ({ dispatch, getState }) => {
    const queryResults = getQueryResults(getState());
    const queryResultCols = queryResults?.[0]?.data?.cols ?? [];
    const columnNames = queryResultCols.map((col: any) => col.name);
    const visibleColumnNames = new Set(reaction.visible_columns);
    const tableColumns = columnNames.map((name: string) => ({
      name,
      enabled: visibleColumnNames.has(name),
    }));

    await dispatch(
      onUpdateVisualizationSettings({
        "table.columns": tableColumns,
      }),
    );
  };

export const changeDisplayType: ReactionHandler<
  MetabotChangeDisplayTypeReaction
> =
  reaction =>
  async ({ dispatch, getState }) => {
    {
      const display = reaction.display_type;
      const question = getQuestion(getState());

      if (!question) {
        dispatch(
          stopProcessingAndNotify(
            t`You have to be viewing a question for me to modify it.`,
          ),
        );
        return;
      }

      const newQuestion = setQuestionDisplayType(question, display);

      await dispatch(
        updateQuestion(newQuestion, {
          run: true,
          shouldUpdateUrl: Lib.queryDisplayInfo(newQuestion.query()).isEditable,
        }),
      );
      dispatch(setUIControls({ isShowingRawTable: false }));
    }
  };

export const changeAxesLabels: ReactionHandler<
  MetabotChangeAxesLabelsReaction
> =
  reaction =>
  async ({ dispatch }) => {
    const settings: Record<string, string | undefined> = {};
    if (reaction.x_axis_label) {
      settings["graph.x_axis.title_text"] = reaction.x_axis_label;
    }
    if (reaction.y_axis_label) {
      settings["graph.y_axis.title_text"] = reaction.y_axis_label;
    }

    await dispatch(onUpdateVisualizationSettings(settings));
  };
