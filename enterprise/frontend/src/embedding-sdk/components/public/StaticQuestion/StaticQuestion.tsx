import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import {
  InteractiveQuestionProvider,
  type InteractiveQuestionProviderProps,
} from "embedding-sdk/components/private/InteractiveQuestion/context";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";

import { InteractiveQuestion } from "../InteractiveQuestion";
import type { InteractiveQuestionQuestionIdProps } from "../InteractiveQuestion/types";

/**
 * @interface
 * @expand
 * @category StaticQuestion
 */
export type StaticQuestionProps = InteractiveQuestionQuestionIdProps & {
  withChartTypeSelector?: boolean;
} & Pick<InteractiveQuestionProviderProps, "initialSqlParameters"> &
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
  <InteractiveQuestionProvider
    questionId={initialQuestionId}
    variant="static"
    initialSqlParameters={initialSqlParameters}
  >
    {withChartTypeSelector && <InteractiveQuestion.ChartTypeDropdown />}
    <InteractiveQuestion.QuestionVisualization
      height={height}
      width={width}
      className={className}
      style={style}
    />
  </InteractiveQuestionProvider>
);

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = withPublicComponentWrapper(StaticQuestionInner);
