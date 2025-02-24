import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import { FlexibleSizeComponent } from "embedding-sdk/components/private/FlexibleSizeComponent";
import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import {
  isQuestionDirty,
  isQuestionResultDirty,
  isQuestionRunnable,
} from "metabase/query_builder/utils/question";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionContext } from "../context";

export const QuestionVisualization = ({
  height,
  width,
  className,
  style,
}: FlexibleSizeProps) => {
  const {
    question,
    originalQuestion,
    lastRunQuestion,
    queryResults,
    mode,
    isQuestionLoading,
    isQueryRunning,
    navigateToNewCard,
    onNavigateBack,
    updateQuestion,
    queryQuestion,
  } = useInteractiveQuestionContext();

  // When visualizing a question for the first time, there is no query result yet.
  const isQueryResultLoading = question && !queryResults;

  const isDirty = useMemo(() => {
    return isQuestionDirty(question, originalQuestion);
  }, [question, originalQuestion]);

  const isResultDirty = useMemo(() => {
    return isQuestionResultDirty({
      question,
      originalQuestion,
      lastRunQuestion,
      lastParameters: lastRunQuestion?.parameters(),
      nextParameters: question?.parameters(),
    });
  }, [question, lastRunQuestion, originalQuestion]);

  const isRunnable = useMemo(() => {
    return isQuestionRunnable(question, isDirty);
  }, [question, isDirty]);

  if (isQuestionLoading || isQueryResultLoading) {
    return <SdkLoader />;
  }

  if (!question) {
    return <SdkError message={t`Question not found`} />;
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
        isRunnable={isRunnable}
        isRunning={isQueryRunning}
        isObjectDetail={false}
        isResultDirty={isResultDirty}
        isNativeEditorOpen={false}
        result={result}
        noHeader
        mode={mode}
        navigateToNewCardInsideQB={navigateToNewCard}
        onNavigateBack={onNavigateBack}
        runQuestionQuery={async () => {
          await queryQuestion();
        }}
        onUpdateQuestion={(question: Question) =>
          updateQuestion(question, { run: false })
        }
      />
    </FlexibleSizeComponent>
  );
};
