import { useEffect, useState } from "react";

import type { SdkClickActionPluginsConfig } from "embedding-sdk";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { initializeQBRaw } from "metabase/query_builder/actions";
import { getQueryResults } from "metabase/query_builder/selectors";

import { InteractiveQuestionResult } from "./InteractiveQuestionResult";

interface InteractiveAdHocQuestionProps {
  questionPath: string; // route path to load a question, e.g. /question/140-best-selling-products - for saved, or /question/xxxxxxx for ad-hoc encoded question config
  onNavigateBack: () => void;

  withTitle?: boolean;
  height?: number;
  plugins?: SdkClickActionPluginsConfig;
}

export const InteractiveAdHocQuestion = ({
  questionPath,
  onNavigateBack,
  withTitle = true,
  height,
  plugins,
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
    loadQuestion(dispatch, questionPath);
  }, [dispatch, questionPath]);

  useEffect(() => {
    if (queryResults) {
      setIsQuestionLoading(false);
    }
  }, [queryResults]);

  return (
    <InteractiveQuestionResult
      isQuestionLoading={isQuestionLoading}
      onNavigateBack={onNavigateBack}
      height={height}
      componentPlugins={plugins}
      withResetButton
      onResetButtonClick={onNavigateBack}
      withTitle={withTitle}
    />
  );
};

// This generates route parameters based on provided URL path to use it QB (QueryBuilder) initialization logic, which loads question and all it needs. See "initializeQBRaw" redux action.
export const getQuestionParameters = (questionPath: string) => {
  const url = new URL(`http://metabase.com${questionPath}`); // we use a dummy host name to fill-in full URL
  const pathSections = questionPath.split("/").slice(1); // remove first empty section
  const entityId = pathSections.length > 1 ? pathSections[1] : null; // extract possible question id if it is a saved question URL

  return {
    location: {
      search: url.search,
      hash: url.hash,
      pathname: url.pathname,
    },
    params: entityId ? { slug: entityId } : {},
  };
};
