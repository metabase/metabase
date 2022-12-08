import { useEffect, useState } from "react";
import { getIn } from "icepick";
import { formatNativeQuery } from "metabase/lib/engine";
import { NativeQueryForm } from "metabase-types/api";
import Question from "metabase-lib/Question";

interface UseNativeQuery {
  query?: string;
  error?: string;
  isLoading: boolean;
}

export const useNativeQuery = (question: Question) => {
  const [state, setState] = useState<UseNativeQuery>({ isLoading: true });

  useEffect(() => {
    question
      .apiGetNativeQueryForm()
      .then(data =>
        setState({ query: getQuery(question, data), isLoading: false }),
      )
      .catch(error =>
        setState({ error: getErrorMessage(error), isLoading: false }),
      );
  }, [question]);

  return state;
};

const getQuery = (question: Question, data: NativeQueryForm) => {
  const engine = question.database()?.engine;
  return formatNativeQuery(data.query, engine);
};

const getErrorMessage = (error: unknown): string | undefined => {
  return getIn(error, ["data", "message"]);
};
