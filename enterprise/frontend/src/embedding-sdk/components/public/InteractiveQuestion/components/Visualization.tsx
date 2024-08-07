import cx from "classnames";
import { t } from "ttag";

import {
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";

import { useInteractiveQuestionContext } from "../context";
import { Box } from "metabase/ui";
import { useElementSize } from "@mantine/hooks";

export const QuestionVisualization = () => {
  const {
    question,
    queryResults,
    mode,
    isQuestionLoading,
    isQueryRunning,
    onNavigateBack,
    onNavigateToNewCard,
  } = useInteractiveQuestionContext();

  const { height, ref, width } = useElementSize();

  if (isQuestionLoading) {
    return <SdkLoader />;
  }

  if (!question || !queryResults) {
    return <SdkError message={t`Question not found`} />;
  }

  const [result] = queryResults;
  const card = question.card();

  return (
    <Box ref={ref} w="100%" h="100%">
      <Box w={width} h={height || (width ? width / 9 : 500)}>
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
          navigateToNewCardInsideQB={onNavigateToNewCard}
          onNavigateBack={onNavigateBack}
        />
      </Box>
    </Box>
  );
};
