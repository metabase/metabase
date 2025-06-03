import { useRegisterMetabotContextProvider } from "metabase/metabot";

import { getQuestion } from "../selectors";

export const useRegisterQueryBuilderMetabotContext = () => {
  useRegisterMetabotContextProvider((state) => {
    const question = getQuestion(state);
    if (!question) {
      return {};
    }

    return {
      user_is_viewing: question.isSaved()
        ? [{ type: question.type(), id: question.id() }]
        : [{ type: "adhoc", query: question.datasetQuery() }],
    };
  }, []);
};
