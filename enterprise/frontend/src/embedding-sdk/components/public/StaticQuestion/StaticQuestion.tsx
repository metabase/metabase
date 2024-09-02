import cx from "classnames";
import { type CSSProperties, useEffect, useState } from "react";
import { t } from "ttag";

import {
  SdkError,
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
import { ChartTypeSettings } from "metabase/query_builder/components/view/chart-type/ChartTypeSettings";
import {
  type ChartVisualizationControlsProps,
  useChartVisualizationSettings,
} from "metabase/query_builder/components/view/chart-type/ChartTypeSettings/ChartTypeSettings";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Group } from "metabase/ui";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import Question from "metabase-lib/v1/Question";
import type { Card, CardEntityId, CardId, Dataset } from "metabase-types/api";

export type StaticQuestionProps = {
  questionId: CardId | CardEntityId;
  parameterValues?: Record<string, string | number>;
} & Pick<StaticQuestionInnerProps, "height" | "showVisualizationSelector">;

type State = {
  loading: boolean;
  card: Card | null;
  result: Dataset | null;
  error: GenericErrorResponse | null;
} & Pick<StaticQuestionInnerProps, "card" | "result">;

type StaticQuestionInnerProps = {
  card: Card | null;
  metadata: Question["_metadata"];
  showVisualizationSelector?: boolean;
  height?: CSSProperties["height"];
  isLoading: boolean;
} & Pick<ChartVisualizationControlsProps, "onVisualizationChange" | "result">;

const StaticQuestionInner = ({
  card,
  metadata,
  result,
  onVisualizationChange,
  showVisualizationSelector,
  height,
  isLoading,
}: StaticQuestionInnerProps) => {
  const question = new Question(card, metadata);
  const defaultHeight = card ? getDefaultVizHeight(card.display) : undefined;

  const legacyQuery = question.legacyQuery({
    useStructuredQuery: true,
  });

  const {
    selectedVisualization,
    setSelectedVisualization,
    makesSense,
    nonSense,
  } = useChartVisualizationSettings({
    question,
    result,
    query: legacyQuery,
    onVisualizationChange,
  });

  return (
    <Box
      className={cx(CS.flexFull, CS.fullWidth)}
      h={height ?? defaultHeight}
      bg="var(--mb-color-bg-question)"
    >
      <Group h="100%" pos="relative" align="flex-start">
        {showVisualizationSelector && (
          <Box w="355px">
            <ChartTypeSettings
              selectedVisualization={selectedVisualization}
              setSelectedVisualization={setSelectedVisualization}
              makesSense={makesSense}
              nonSense={nonSense}
            />
          </Box>
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

const StaticQuestionLoader = ({
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

  const isLoading = loading || (!result && !error) || isValidatingEntityId;

  const onVisualizationChange = (newQuestion: Question) => {
    setState({
      card: newQuestion.card(),
      result: result,
      loading: false,
      error: null,
    });
  };

  if (error) {
    return (
      <SdkError
        message={getResponseErrorMessage(error) ?? t`Invalid question ID`}
      />
    );
  }

  if (isLoading) {
    return <SdkLoader />;
  }

  return (
    <StaticQuestionInner
      card={card}
      metadata={metadata}
      result={result}
      onVisualizationChange={onVisualizationChange}
      showVisualizationSelector={showVisualizationSelector}
      height={height}
      isLoading={isLoading}
    />
  );
};

export const StaticQuestion = withPublicComponentWrapper(StaticQuestionLoader);
