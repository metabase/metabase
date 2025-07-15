import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  SdkQuestionProvider,
  type SdkQuestionProviderProps,
} from "embedding-sdk/components/private/SdkQuestion/context";

import { InteractiveQuestion } from "../SdkQuestion";
import type { SdkQuestionIdProps } from "../SdkQuestion/types";

/**
 * @interface
 * @expand
 * @category StaticQuestion
 */
export type StaticQuestionProps = SdkQuestionIdProps & {
  withChartTypeSelector?: boolean;
} & Pick<SdkQuestionProviderProps, "initialSqlParameters"> &
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
  <SdkQuestionProvider
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
  </SdkQuestionProvider>
);

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = withPublicComponentWrapper(StaticQuestionInner);
