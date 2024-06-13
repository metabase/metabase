import { useEffect, useState } from "react";

import { InteractiveQuestionResult } from "embedding-sdk/components/public/InteractiveQuestion/InteractiveQuestionResult";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { initializeQBRaw } from "metabase/query_builder/actions";
import { getQueryResults } from "metabase/query_builder/selectors";

interface InteractiveAdHocQuestionProps {
  questionUrl: string;
  onNavigateBack: () => void;

  withTitle?: boolean;
}

export const InteractiveAdHocQuestion = ({
  questionUrl,
  onNavigateBack,
  withTitle,
}: InteractiveAdHocQuestionProps) => {
  const dispatch = useDispatch();

  const queryResults = useSelector(getQueryResults);

  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const loadQuestion = async (
    dispatch: ReturnType<typeof useDispatch>,
    questionUrl: string,
  ) => {
    setIsQuestionLoading(true);

    const { location, params } = getQuestionParameters(questionUrl);
    try {
      await dispatch(initializeQBRaw(location, params));
    } catch (e) {
      console.error(`Failed to get question`, e);
      setIsQuestionLoading(false);
    }
  };

  useEffect(() => {
    loadQuestion(dispatch, questionUrl);
  }, [dispatch, questionUrl]);

  useEffect(() => {
    if (queryResults) {
      setIsQuestionLoading(false);
    }
  }, [queryResults]);

  return (
    <InteractiveQuestionResult
      isQuestionLoading={isQuestionLoading}
      onNavigateBack={onNavigateBack}
      // height={height}
      // componentPlugins={plugins}
      withResetButton
      onResetButtonClick={onNavigateBack}
      withTitle={withTitle}
    />
  );
};

const getQuestionParameters = (questionUrl: string) => {
  const url = new URL(`http://metabase.com${questionUrl}`);

  return {
    location: {
      search: url.search,
      hash: url.hash,
      pathname: url.pathname,
    },
    params: {},
  };
};
