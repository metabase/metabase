import cx from "classnames";
import { t } from "ttag";

import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import { FlexibleSizeComponent } from "embedding-sdk/components/private/FlexibleSizeComponent";
import {
  QuestionNotFoundError,
  SdkError,
  SdkLoader,
} from "embedding-sdk/components/private/PublicComponentWrapper";
import { shouldRunCardQuery } from "embedding-sdk/lib/sdk-question";
import { useLocale } from "metabase/common/hooks/use-locale";
import CS from "metabase/css/core/index.css";
import QueryVisualization from "metabase/query_builder/components/QueryVisualization";
import type Question from "metabase-lib/v1/Question";

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
  } = useSdkQuestionContext();

  // When visualizing a question for the first time, there is no query result yet.
  const isQueryResultLoading =
    question && shouldRunCardQuery(question) && !queryResults;

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
        navigateToNewCardInsideQB={navigateToNewCard}
        onNavigateBack={onNavigateBack}
        onUpdateQuestion={(question: Question) =>
          updateQuestion(question, { run: false })
        }
      />
    </FlexibleSizeComponent>
  );
};
