import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import {
  InteractiveQuestionProvider,
  type InteractiveQuestionProviderProps,
} from "embedding-sdk/components/private/InteractiveQuestion/context";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";

import { InteractiveQuestion } from "../InteractiveQuestion";

export type StaticQuestionProps = {
  withChartTypeSelector?: boolean;
} & Pick<
  InteractiveQuestionProviderProps,
  "questionId" | "initialSqlParameters"
> &
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

export const StaticQuestion = withPublicComponentWrapper(StaticQuestionInner);
