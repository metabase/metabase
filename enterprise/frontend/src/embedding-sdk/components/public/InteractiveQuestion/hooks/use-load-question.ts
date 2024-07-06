import { useCallback, useEffect, useState } from "react";
import { useUnmount } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { initializeQBRaw, resetQB } from "metabase/query_builder/actions";
import { getQueryResults } from "metabase/query_builder/selectors";

export type UseLoadQuestionParams = {
  location: {
    search?: string;
    hash?: string;
    pathname?: string;
    query?: Record<string, unknown>;
  };
  params: {
    slug?: string;
  };
};
export const useLoadQuestion = ({
  location,
  params,
}: UseLoadQuestionParams) => {
  const dispatch = useDispatch();

  const queryResults = useSelector(getQueryResults);

  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const loadQuestion = useCallback(async () => {
    setIsQuestionLoading(true);

    try {
      await dispatch(initializeQBRaw(location, params));
    } catch (e) {
      console.error(`Failed to get question`, e);
      setIsQuestionLoading(false);
    }
  }, [dispatch, location, params]);

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  useEffect(() => {
    if (queryResults) {
      setIsQuestionLoading(false);
    }
  }, [queryResults]);

  const resetQuestion = () => {
    loadQuestion();
  };

  useUnmount(() => {
    dispatch(resetQB());
  });
  return { resetQuestion, isQuestionLoading };
};
