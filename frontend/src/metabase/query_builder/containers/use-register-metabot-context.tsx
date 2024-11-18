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
    const queryResult = getFirstQueryResult(state);
    const datasetColumns = queryResult?.data?.cols ?? [];
    const vizSettings = getVisualizationSettings(state);

    return {
      dataset_query: question?.datasetQuery(),
      dataset_columns: datasetColumns,
      display_type: question?.display(),
      visualization_settings: vizSettings,

      // not used atm
      colorPalette: getAccentColors(),
      current_visualization_settings: getVisualizationMetabotContext(state),
    };
  }, []);
};
