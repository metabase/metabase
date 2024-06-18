import { useCallback, useEffect, useState } from "react";

import { InteractiveQuestionResult } from "embedding-sdk/components/private/InteractiveQuestionResult";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import type { SdkClickActionPluginsConfig } from "embedding-sdk/lib/plugins";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { initializeQBRaw } from "metabase/query_builder/actions";
import { getCard, getQueryResults } from "metabase/query_builder/selectors";
import type { CardId } from "metabase-types/api";

interface InteractiveQuestionProps {
  questionId: CardId;
  withResetButton?: boolean;
  withTitle?: boolean;
  customTitle?: React.ReactNode;
  plugins?: SdkClickActionPluginsConfig;
  height?: string | number;
}

export const _InteractiveQuestion = ({
  questionId,
  withResetButton = true,
  withTitle = false,
  customTitle,
  plugins,
  height,
}: InteractiveQuestionProps): JSX.Element | null => {
  const dispatch = useDispatch();

  const card = useSelector(getCard);
  const queryResults = useSelector(getQueryResults);

  const hasQuestionChanges =
    card && (!card.id || card.id !== card.original_card_id);

  const [isQuestionLoading, setIsQuestionLoading] = useState(true);

  const loadQuestion = async (
    dispatch: ReturnType<typeof useDispatch>,
    questionId: CardId,
  ) => {
    setIsQuestionLoading(true);

    const { location, params } = getQuestionParameters(questionId);
    try {
      await dispatch(initializeQBRaw(location, params));
    } catch (e) {
      console.error(`Failed to get question`, e);
      setIsQuestionLoading(false);
    }
  };

  useEffect(() => {
    loadQuestion(dispatch, questionId);
  }, [dispatch, questionId]);

  const handleQuestionReset = useCallback(() => {
    loadQuestion(dispatch, questionId);
  }, [dispatch, questionId]);

  useEffect(() => {
    if (queryResults) {
      setIsQuestionLoading(false);
    }
  }, [queryResults]);

  return (
    <InteractiveQuestionResult
      isQuestionLoading={isQuestionLoading}
      onNavigateBack={handleQuestionReset}
      height={height}
      componentPlugins={plugins}
      withResetButton={hasQuestionChanges && withResetButton}
      onResetButtonClick={handleQuestionReset}
      withTitle={withTitle}
      customTitle={customTitle}
    />
  );
};

export const InteractiveQuestion =
  withPublicComponentWrapper(_InteractiveQuestion);

export const getQuestionParameters = (questionId: CardId) => {
  return {
    location: {
      query: {}, // TODO: add here wrapped parameterValues
      hash: "",
      pathname: `/question/${questionId}`,
    },
    params: {
      slug: questionId.toString(),
    },
  };
};
