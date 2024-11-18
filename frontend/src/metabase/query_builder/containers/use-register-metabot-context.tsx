import { useRegisterMetabotContextProvider } from "metabase/metabot";

import { getQuestion } from "../selectors";

export const useRegisterMetabotContext = () => {
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
