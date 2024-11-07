import _ from "underscore";

import { getAccentColors } from "metabase/lib/colors/groups";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { getVisualizationMetabotContext } from "metabase/metabot-v3/selectors";

import { getQueryResults, getQuestion } from "../selectors";

export const useRegisterMetabotContext = () => {
  useRegisterMetabotContextProvider(state => {
    const question = getQuestion(state);

    const queryResults = getQueryResults(state);
    const queryResultCols = queryResults?.[0]?.data?.cols ?? [];
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
      colorPalette: getAccentColors(),
      current_question_id: question?.id() || null,
      current_query: question?.datasetQuery(),
      current_visualization_settings: {
        ...vizSettings,
        current_display_type: question?.display(),
        ...(visible_columns.length ? { visible_columns } : {}),
        ...(hidden_columns.length ? { hidden_columns } : {}),
      },
    };
  }, []);
};
