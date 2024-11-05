import _ from "underscore";

import { getAccentColors } from "metabase/lib/colors/groups";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { State } from "metabase-types/store";

import {
  getQueryResults,
  getQuestion,
  getTransformedSeries,
  getVisualizationSettings,
} from "../selectors";

const getVisualizationSettingsWithDefaults = (state: State) => {
  const computedVisualizationSettings = getVisualizationSettings(
    state,
  ) as ComputedVisualizationSettings;
  const transformedSeries = getTransformedSeries(state);
  const result = { ...computedVisualizationSettings };

  if (typeof computedVisualizationSettings.series === "function") {
    transformedSeries.forEach(series => {
      result[keyForSingleSeries(series)] =
        computedVisualizationSettings.series(series);
    });
  }

  return result;
};

export const useRegisterMetabotContext = () => {
  useRegisterMetabotContextProvider(state => {
    const question = getQuestion(state);

    const queryResults = getQueryResults(state);
    const queryResultCols = queryResults?.[0]?.data?.cols ?? [];
    const columnNames = queryResultCols.map((col: any) => col.name);

    const vizSettings = getVisualizationSettingsWithDefaults(state);
    const columnSettings = vizSettings["table.columns"] || [];
    const disabledColumnNames = new Set(
      columnSettings.filter(col => !col.enabled).map(c => c.name),
    );

    const [hidden_columns, visible_columns] = _.partition(
      columnNames,
      colName => disabledColumnNames.has(colName),
    );

    return {
      colorPalette: getAccentColors(),
      current_question_id: question?.id() || null,
      current_visualization_settings: {
        ...vizSettings,
        current_display_type: question?.display(),
        ...(visible_columns.length ? { visible_columns } : {}),
        ...(hidden_columns.length ? { hidden_columns } : {}),
      },
    };
  }, []);
};
