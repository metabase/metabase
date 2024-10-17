import cx from "classnames";
import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { getDefaultVizHeight } from "embedding-sdk/lib/default-height";
import { loadStaticQuestion } from "embedding-sdk/lib/load-static-question";
import CS from "metabase/css/core/index.css";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import {
  ChartTypeSettings,
  useChartTypeVisualizations,
} from "metabase/query_builder/components/chart-type-selector";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Group } from "metabase/ui";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import Question from "metabase-lib/v1/Question";
import type { Card, CardEntityId, CardId, Dataset } from "metabase-types/api";
import { SdkError } from "embedding-sdk/components/private/SdkError";

export type StaticQuestionProps = {
  questionId: CardId | CardEntityId;
  showVisualizationSelector?: boolean;
  height?: string | number;
  parameterValues?: Record<string, string | number>;
};

type State = {
  loading: boolean;
  card: Card | null;
  result: Dataset | null;
  error: GenericErrorResponse | null;
};

type StaticQuestionVisualizationSelectorProps = {
  question: Question;
  result: Dataset | null;
  onUpdateQuestion: (question: Question) => void;
};

const StaticQuestionVisualizationSelector = ({
  question,
  result,
  onUpdateQuestion,
}: StaticQuestionVisualizationSelectorProps) => {
  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  } = useChartTypeVisualizations({
    question,
    result,
    onUpdateQuestion,
  });

  return (
    <Box w="355px">
      <ChartTypeSettings
        selectedVisualization={selectedVisualization}
        onSelectVisualization={updateQuestionVisualization}
        sensibleVisualizations={sensibleVisualizations}
        nonSensibleVisualizations={nonSensibleVisualizations}
      />
    </Box>
  );
};

const StaticQuestionInner = ({
  questionId: initId,
  showVisualizationSelector,
  height,
  parameterValues,
}: StaticQuestionProps): JSX.Element | null => {
  const { isLoading: isValidatingEntityId, id: questionId } =
    useValidatedEntityId({
      type: "card",
      id: initId,
    });

  const metadata = useSelector(getMetadata);

  const [{ loading, card, result, error }, setState] = useState<State>({
    loading: false,
    card: null,
    result: null,
    error: null,
  });

  useEffect(() => {
    async function loadCardData() {
      setState(prevState => ({
        ...prevState,
        loading: true,
      }));

      if (!questionId) {
        return;
      }

      try {
        const { card, result } = await loadStaticQuestion({
          questionId,
          parameterValues,
        });

        setState(prevState => ({
          ...prevState,
          card,
          result,
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (typeof error === "object") {
          setState(prevState => ({
            ...prevState,
            result: null,
            card: null,
            loading: false,
            error,
          }));
        } else {
          console.error("error loading static question", error);
        }
      }
    }

    loadCardData();
  }, [questionId, parameterValues]);

  const changeVisualization = (newQuestion: Question) => {
    setState({
      card: newQuestion.card(),
      result: result,
      loading: false,
      error: null,
    });
  };

  const isLoading = loading || (!result && !error) || isValidatingEntityId;

  if (error) {
    return <SdkError status="question-not-found" />;
  }

  if (isLoading) {
    return <SdkLoader />;
  }

  const question = new Question(card, metadata);
  const defaultHeight = card ? getDefaultVizHeight(card.display) : undefined;

  return (
    <Box
      className={cx(CS.flexFull, CS.fullWidth)}
      h={height ?? defaultHeight}
      bg="var(--mb-color-bg-question)"
    >
      <Group h="100%" pos="relative" align="flex-start">
        {showVisualizationSelector && (
          <StaticQuestionVisualizationSelector
            question={question}
            result={result}
            onUpdateQuestion={changeVisualization}
          />
        )}
        <QueryVisualization
          className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
          question={question}
          rawSeries={[{ card, data: result?.data }]}
          isRunning={isLoading}
          isObjectDetail={false}
          isResultDirty={false}
          isNativeEditorOpen={false}
          result={result}
          noHeader
          mode={PublicMode}
        />
      </Group>
    </Box>
  );
};

export const StaticQuestion = withPublicComponentWrapper(StaticQuestionInner);
