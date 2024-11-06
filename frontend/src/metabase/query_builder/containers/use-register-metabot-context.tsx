import _ from "underscore";

import { getAccentColors } from "metabase/lib/colors/groups";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { State } from "metabase-types/store";

import {
  getQueryResults,
  getQuestion,
  getRawSeries,
  getTransformedSeries,
  getVisualizationSettings,
} from "../selectors";

const getVisualizationSettingsWithDefaults = (state: State) => {
  const transformedSeries = getTransformedSeries(state);
  const rawSeries = getRawSeries(state);
  const hydratedVisualizationSettings: ComputedVisualizationSettings = {
    ...getVisualizationSettings(state),
  };

  if (typeof hydratedVisualizationSettings.series === "function") {
    const seriesSettings: ComputedVisualizationSettings["series_settings"] = {};
    transformedSeries.forEach(series => {
      seriesSettings[keyForSingleSeries(series)] =
        hydratedVisualizationSettings.series(series);
    });
    hydratedVisualizationSettings.series_settings = seriesSettings;
  }

  if (typeof hydratedVisualizationSettings.column === "function") {
    const columnSettings: ComputedVisualizationSettings["column_settings"] = {
      ...hydratedVisualizationSettings.column_settings,
    };
    rawSeries.forEach(series => {
      series.data.cols.forEach(col => {
        const columnSetting = hydratedVisualizationSettings.column?.(col);
        if (columnSetting) {
          // Use column name as key instead of column key because LLMs are bad with stringified json keys like `["name","column_name"]`
          columnSettings[col.name] = columnSetting;
        }
      });
    });

    hydratedVisualizationSettings.column_settings = columnSettings;
  }

  return hydratedVisualizationSettings;
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
