import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  QuestionProvider,
  type QuestionProviderProps,
} from "embedding-sdk/components/private/Question/context";

import { Question } from "../Question";
import type { QuestionQuestionIdProps } from "../Question/types";

/**
 * @interface
 * @expand
 * @category StaticQuestion
 */
export type StaticQuestionProps = QuestionQuestionIdProps & {
  withChartTypeSelector?: boolean;
} & Pick<QuestionProviderProps, "initialSqlParameters"> &
  FlexibleSizeProps;

const StaticQuestionInner = ({
  questionId: initialQuestionId,
  withChartTypeSelector,
  height,
  width,
  className,
  style,
  initialSqlParameters,
}: StaticQuestionProps): JSX.Element | null => (
  <QuestionProvider
    questionId={initialQuestionId}
    variant="static"
    initialSqlParameters={initialSqlParameters}
  >
    {withChartTypeSelector && <Question.ChartTypeDropdown />}
    <Question.QuestionVisualization
      height={height}
      width={width}
      className={className}
      style={style}
    />
  </QuestionProvider>
);

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = withPublicComponentWrapper(StaticQuestionInner);
