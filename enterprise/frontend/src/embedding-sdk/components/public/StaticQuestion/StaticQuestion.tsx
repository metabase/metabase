import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import {
  InteractiveQuestionProvider,
  type InteractiveQuestionProviderProps,
} from "embedding-sdk/components/private/InteractiveQuestion/context";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { StaticQuestionSdkMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkMode";

import { InteractiveQuestion } from "../InteractiveQuestion";

export type StaticQuestionProps = {
  withChartTypeSelector?: boolean;
  questionId: InteractiveQuestionProviderProps["cardId"];
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
}: StaticQuestionProps): JSX.Element | null => {
  return (
    <InteractiveQuestionProvider
      cardId={initialQuestionId}
      mode={StaticQuestionSdkMode}
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
};

export const StaticQuestion = withPublicComponentWrapper(StaticQuestionInner);
