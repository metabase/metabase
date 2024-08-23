import cx from "classnames";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { useSdkElementSize } from "embedding-sdk/hooks/private/use-sdk-element-size";
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import { Box } from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

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

  const display = question?.card()?.display;
  const { height, ref, width } = useSdkElementSize(display);

  if (isQuestionLoading) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  const [result] = queryResults;
  const card = question.card();

  return (
    <Box w="100%" h="100%" ref={ref}>
      <Box w={width} h={height}>
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
      </Box>
    </Box>
  );
};
