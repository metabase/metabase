import cx from "classnames";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { useLoadStaticQuestion } from "embedding-sdk/hooks/private/use-load-static-question";
import { getDefaultVizHeight } from "embedding-sdk/lib/default-height";
import CS from "metabase/css/core/index.css";
import { useValidatedEntityId } from "metabase/lib/entity-id/hooks/use-validated-entity-id";
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
import type { CardId, Dataset } from "metabase-types/api";

export type StaticQuestionProps = {
  questionId: CardId | string;
  showVisualizationSelector?: boolean;
  height?: string | number;
  parameterValues?: Record<string, string | number>;
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

  const { card, loading, result, error, updateQuestion } =
    useLoadStaticQuestion(questionId, parameterValues);

  const isLoading = loading || (!result && !error) || isValidatingEntityId;

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
            onUpdateQuestion={updateQuestion}
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
