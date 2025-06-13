import { useRegisterMetabotContextProvider } from "metabase/metabot";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { getFirstQueryResult, getQuestion } from "../selectors";

export const registerQueryBuilderMetabotContextFn = ({
  question,
  queryResult,
}: {
  question: Question | undefined;
  queryResult: any;
}) => {
  if (!question) {
    return {};
  }

  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);
  const questionCtx = question.isSaved()
    ? { id: question.id(), type: question.type() }
    : { type: "adhoc" as const };
  const queryCtx = {
    query: question.datasetQuery(),
    sql_engine: isNative ? Lib.engine(query) : undefined,
    is_native: isNative,
    error: queryResult?.error,
  };

  return {
    user_is_viewing: [
      {
        ...questionCtx,
        ...queryCtx,
      },
    ],
  };
};

export const useRegisterQueryBuilderMetabotContext = () => {
  useRegisterMetabotContextProvider((state) => {
    const question = getQuestion(state);
    const queryResult = getFirstQueryResult(state);

    return registerQueryBuilderMetabotContextFn({
      question,
      queryResult,
    });
  }, []);
};
