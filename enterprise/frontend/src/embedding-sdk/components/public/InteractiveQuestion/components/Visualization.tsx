import cx from "classnames";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  useInteractiveQuestionContext,
  useInteractiveQuestionData,
} from "embedding-sdk/components/public/InteractiveQuestion/context";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { navigateToNewCardInsideQB } from "metabase/query_builder/actions";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

export const QuestionVisualization = () => {
  const dispatch = useDispatch();

  const { card, isQueryRunning, queryResults, question, result } =
    useInteractiveQuestionData();

  const { mode, isQuestionLoading, onNavigateBack } = useInteractiveQuestionContext();
  

  if (isQuestionLoading || isQueryRunning) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

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
      navigateToNewCardInsideQB={(props: any) => {
        dispatch(navigateToNewCardInsideQB(props));
      }}
      onNavigateBack={onNavigateBack}
    />
  );
};
