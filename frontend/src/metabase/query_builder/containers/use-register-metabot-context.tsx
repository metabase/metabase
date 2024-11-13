import _ from "underscore";

import { getAccentColors } from "metabase/lib/colors/groups";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { getVisualizationMetabotContext } from "metabase/metabot-v3/selectors";

import {
  getFirstQueryResult,
  getQuestion,
  getVisualizationSettings,
} from "../selectors";

export const useRegisterMetabotContext = () => {
  useRegisterMetabotContextProvider(state => {
    const question = getQuestion(state);
    const dataset = getFirstQueryResult(state);
    const visualizationSettings = getVisualizationSettings(state);
    const queryResultCols = dataset?.data?.cols ?? [];
    const columnNames = queryResultCols.map((col: any) => ({
      name: col.name,
      ...(col.description && { description: col.description }),
    }));

    const vizSettings = getVisualizationMetabotContext(state);
    const columnSettings = vizSettings["table.columns"] || [];
    const disabledColumnNames = new Set(
      columnSettings.filter(col => !col.enabled).map(c => c.name),
    );

    const [hidden_columns, visible_columns] = _.partition(columnNames, col =>
      disabledColumnNames.has(col.name),
    );

    return {
      display: question?.display(),
      dataset_query: question?.datasetQuery(),
      dataset_columns: queryResultCols,
      visualization_settings: visualizationSettings,

      // legacy context
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
