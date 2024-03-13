import { getIn } from "icepick";
import { useEffect, useState } from "react";

import { formatNativeQuery } from "metabase/lib/engine";
import type Question from "metabase-lib/v1/Question";
import type { NativeQueryForm } from "metabase-types/api";

interface UseNativeQuery {
  query?: string;
  error?: string;
  isLoading: boolean;
}

export const useNativeQuery = (
  question: Question,
  getNativeQuery: () => Promise<NativeQueryForm>,
) => {
  const [state, setState] = useState<UseNativeQuery>({ isLoading: true });

  useEffect(() => {
    getNativeQuery()
      .then(data =>
        setState({ query: getQueryText(question, data), isLoading: false }),
      )
      .catch(error =>
        setState({ error: getQueryError(error), isLoading: false }),
      );
  }, [question, getNativeQuery]);

  return state;
};

const getQueryText = (question: Question, data: NativeQueryForm) => {
  const engine = question.database()?.engine;
  return formatNativeQuery(data.query, engine);
};

const getQueryError = (error: unknown): string | undefined => {
  return getIn(error, ["data", "message"]);
};
