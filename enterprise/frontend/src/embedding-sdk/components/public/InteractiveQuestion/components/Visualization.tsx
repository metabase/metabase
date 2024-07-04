import cx from "classnames";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

import { useInteractiveQuestionContext } from "../context";

export const QuestionVisualization = () => {
  const {
    card,
    question,
    queryResults,
    mode,
    isQuestionLoading,
    onNavigateBack,
    onNavigateToNewCard,
  } = useInteractiveQuestionContext();

  if (isQuestionLoading) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  const [result] = queryResults;

  return (
    <QueryVisualization
      className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
      question={question}
      rawSeries={[{ card, data: result && result.data }]}
      // TODO: should we have isQuestionRunning?
      isRunning={isQuestionLoading}
      isObjectDetail={false}
      isResultDirty={false}
      isNativeEditorOpen={false}
      result={result}
      noHeader
      mode={mode}
      navigateToNewCardInsideQB={onNavigateToNewCard}
      onNavigateBack={onNavigateBack}
    />
  );
};
