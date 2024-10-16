import cx from "classnames";

import {
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

import { useInteractiveQuestionContext } from "../context";
import { SdkError } from "embedding-sdk/components/private/SdkError";

export const QuestionVisualization = () => {
  const {
    question,
    queryResults,
    mode,
    isQuestionLoading,
    isQueryRunning,
    navigateToNewCard,
    onNavigateBack,
  } = useInteractiveQuestionContext();

  if (isQuestionLoading) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError status="question-not-found" />;
  }

  const [result] = queryResults;
  const card = question.card();

  return (
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
    />
  );
};
