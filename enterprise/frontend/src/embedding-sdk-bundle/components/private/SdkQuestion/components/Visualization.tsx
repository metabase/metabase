import cx from "classnames";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import type { FlexibleSizeProps } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";
import { FlexibleSizeComponent } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";
import {
  QuestionNotFoundError,
  SdkError,
  SdkLoader,
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { shouldRunCardQuery } from "embedding-sdk-bundle/lib/sdk-question";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsStaticEmbedding } from "embedding-sdk-bundle/store/selectors";
import { useLocale } from "metabase/common/hooks/use-locale";
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import type Question from "metabase-lib/v1/Question";
import type { CardDisplayType } from "metabase-types/api";

import { useSdkQuestionContext } from "../context";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type QuestionVisualizationProps = FlexibleSizeProps;

/**
 * The main visualization component that renders the question results as a chart, table, or other visualization type.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const QuestionVisualization = ({
  height,
  width,
  className,
  style,
}: QuestionVisualizationProps) => {
  const { isLocaleLoading } = useLocale();
  const {
    question,
    queryResults,
    mode,
    isQuestionLoading,
    isQueryRunning,
    navigateToNewCard,
    onNavigateBack,
    updateQuestion,
    originalId,
    onVisualizationChange,
    token,
  } = useSdkQuestionContext();
  const isStaticEmbedding = useSdkSelector(getIsStaticEmbedding);

  const display = useMemo(() => question?.display(), [question]);

  useEffect(() => {
    if (display && onVisualizationChange) {
      onVisualizationChange(display as CardDisplayType);
    }
  }, [display, onVisualizationChange]);

  // When visualizing a question for the first time, there is no query result yet.
  const isQueryResultLoading =
    question &&
    shouldRunCardQuery({ question, isStaticEmbedding }) &&
    !queryResults;

  if (isLocaleLoading || isQuestionLoading || isQueryResultLoading) {
    return <SdkLoader />;
  }

  if (!question) {
    if (originalId) {
      return <QuestionNotFoundError id={originalId} />;
    } else {
      return <SdkError message={t`Question not found`} />;
    }
  }

  const [result] = queryResults ?? [];
  const card = question.card();

  return (
    <FlexibleSizeComponent
      height={height}
      width={width}
      className={className}
      style={style}
    >
      <QueryVisualization
        className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
        question={question}
        rawSeries={[{ card, data: result && result.data }]}
        isRunning={isQueryRunning}
        isObjectDetail={false}
        isResultDirty={false}
        isNativeEditorOpen={false}
        result={result}
        noHeader
        mode={mode}
        token={token}
        navigateToNewCardInsideQB={navigateToNewCard}
        onNavigateBack={onNavigateBack}
        onUpdateQuestion={(question: Question) =>
          updateQuestion(question, { run: false })
        }
      />
    </FlexibleSizeComponent>
  );
};
