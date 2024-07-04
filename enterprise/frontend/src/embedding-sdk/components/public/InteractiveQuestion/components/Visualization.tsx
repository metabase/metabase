import cx from "classnames";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { navigateToNewCardInsideQB } from "metabase/query_builder/actions";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

import { useInteractiveQuestionContext } from "../context";

export const QuestionVisualization = () => {
  const dispatch = useDispatch();

  const {
    card,
    question,
    queryResults,
    mode,
    isQuestionLoading,
    onNavigateBack,
  } = useInteractiveQuestionContext();

  if (isQuestionLoading) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  const [result] = queryResults;

  // eslint-disable-next-line no-console
  console.log("Result is", result);

  return (
    <QueryVisualization
      className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
      question={question}
      // TODO: dataset data??
      // @ts-expect-error: to investigate and fix
      rawSeries={[{ card, data: result && result.data }]}
      // TODO: isQueryRunning?
      isRunning={isQuestionLoading}
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
