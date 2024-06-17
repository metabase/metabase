import { useEffect, useState } from "react";

import type { SdkClickActionPluginsConfig } from "embedding-sdk";
import { InteractiveQuestionResult } from "embedding-sdk/components/public/InteractiveQuestion/InteractiveQuestionResult";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { initializeQBRaw } from "metabase/query_builder/actions";
import { getQueryResults } from "metabase/query_builder/selectors";

interface InteractiveAdHocQuestionProps {
  questionPath: string;
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

const getQuestionParameters = (questionPath: string) => {
  const url = new URL(`http://metabase.com${questionPath}`);
  const pathSections = questionPath.split("/").slice(1); // remove first empty section
  const entityId = pathSections.length > 1 ? pathSections[1] : null;

  return {
    location: {
      search: url.search,
      hash: url.hash,
      pathname: url.pathname,
    },
    params: entityId ? { slug: entityId } : {},
  };
};
