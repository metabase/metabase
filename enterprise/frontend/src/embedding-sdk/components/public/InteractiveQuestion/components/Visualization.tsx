import cx from "classnames";

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

  const { card, isQueryRunning, question, result } =
    useInteractiveQuestionData();

  const { mode, onNavigateBack } = useInteractiveQuestionContext();

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
