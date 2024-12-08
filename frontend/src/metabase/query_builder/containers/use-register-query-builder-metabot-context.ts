import { useRegisterMetabotContextProvider } from "metabase/metabot";

import { getQuestion } from "../selectors";

export const useRegisterQueryBuilderMetabotContext = () => {
  useRegisterMetabotContextProvider(state => {
    const question = getQuestion(state);
    if (!question) {
      return {};
    }

    return {
      dataset_query: question.datasetQuery(),
    };
  }, []);
};
