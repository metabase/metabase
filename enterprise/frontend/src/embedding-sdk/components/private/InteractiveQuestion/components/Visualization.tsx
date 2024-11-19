import cx from "classnames";
import { t } from "ttag";

import { FlexibleSizeComponent } from "embedding-sdk";
import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import type { FlexibleSizeProps } from "embedding-sdk/components/private/util/FlexibleSizeComponent";
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
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
    queryResults,
    mode,
    isQuestionLoading,
    isQueryRunning,
    navigateToNewCard,
    onNavigateBack,
    updateQuestion,
  } = useInteractiveQuestionContext();

  if (isQuestionLoading) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  const [result] = queryResults;
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
        navigateToNewCardInsideQB={navigateToNewCard}
        onNavigateBack={onNavigateBack}
        onUpdateQuestion={(question: Question) =>
          updateQuestion(question, { run: false })
        }
      />
    </FlexibleSizeComponent>
  );
};
