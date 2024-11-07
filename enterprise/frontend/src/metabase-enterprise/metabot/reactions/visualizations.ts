import { t } from "ttag";

import {
  onUpdateVisualizationSettings,
  setUIControls,
  updateQuestion,
} from "metabase/query_builder/actions";
import { setQuestionDisplayType } from "metabase/query_builder/components/chart-type-selector";
import { getQueryResults, getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  MetabotChangeAxesLabelsReaction,
  MetabotChangeColumnSettingsReaction,
  MetabotChangeDisplayTypeReaction,
  MetabotChangeGoalLineReaction,
  MetabotChangeSeriesSettingsReaction,
  MetabotChangeStackingSettingsReaction,
  MetabotChangeVisiualizationSettingsReaction,
  MetabotChangeYAxisRangeReaction,
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

export const changeSeriesSettings: ReactionHandler<
  MetabotChangeSeriesSettingsReaction
> =
  reaction =>
  async ({ dispatch, getState }) => {
    const seriesSettings =
      getQuestion(getState())?.settings().series_settings ?? {};

    const newSeriesSettings = { ...seriesSettings };

    reaction.series_settings.forEach(settings => {
      const onlyIncludedSettings = Object.fromEntries(
        Object.entries(settings).filter(([_, value]) => value !== null),
      );

      newSeriesSettings[settings.key] = {
        ...newSeriesSettings[settings.key],
        ...onlyIncludedSettings,
      };
    });

    await dispatch(
      onUpdateVisualizationSettings({ series_settings: newSeriesSettings }),
    );
  };

export const changeColumnSettings: ReactionHandler<
  MetabotChangeColumnSettingsReaction
> =
  reaction =>
  async ({ dispatch, getState }) => {
    const columnSettings =
      getQuestion(getState())?.settings().column_settings ?? {};

    const newColumnSettings = { ...columnSettings };

    reaction.column_settings.forEach(settings => {
      const columnKey = getColumnKey({ name: settings.key });
      const onlyIncludedSettings = Object.fromEntries(
        Object.entries(settings).filter(([_, value]) => value !== null),
      );

      newColumnSettings[columnKey] = {
        ...newColumnSettings[columnKey],
        ...onlyIncludedSettings,
      };
    });

    await dispatch(
      onUpdateVisualizationSettings({ column_settings: newColumnSettings }),
    );
  };

export const changeStackingSettings: ReactionHandler<
  MetabotChangeStackingSettingsReaction
> =
  ({ type, ...payload }) =>
  async ({ dispatch }) => {
    await dispatch(onUpdateVisualizationSettings(payload));
  };

export const changeGoalLine: ReactionHandler<MetabotChangeGoalLineReaction> =
  ({ type, ...payload }) =>
  async ({ dispatch }) => {
    const goalLineSettings = Object.fromEntries(
      Object.entries(payload).filter(([_, value]) => value !== null),
    );

    await dispatch(onUpdateVisualizationSettings(goalLineSettings));
  };

export const changeYAxisRange: ReactionHandler<
  MetabotChangeYAxisRangeReaction
> =
  ({ type, ...payload }) =>
  async ({ dispatch }) => {
    const yAxisSettings = Object.fromEntries(
      Object.entries(payload).filter(([_, value]) => value !== null),
    );

    await dispatch(onUpdateVisualizationSettings(yAxisSettings));
  };
