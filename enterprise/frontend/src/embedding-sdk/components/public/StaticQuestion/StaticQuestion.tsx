import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import {
  InteractiveQuestionProvider,
  type InteractiveQuestionProviderProps,
} from "embedding-sdk/components/private/InteractiveQuestion/context";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import { Group, Stack } from "metabase/ui";

import { InteractiveQuestion } from "../InteractiveQuestion";
import type { InteractiveQuestionQuestionIdProps } from "../InteractiveQuestion/types";

/**
 * @interface
 * @expand
 * @category StaticQuestion
 */
export type StaticQuestionProps = InteractiveQuestionQuestionIdProps & {
  withChartTypeSelector?: boolean;
} & Pick<
    InteractiveQuestionProviderProps,
    "initialSqlParameters" | "withDownloads"
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
  withDownloads,
}: StaticQuestionProps): JSX.Element | null => (
  <InteractiveQuestionProvider
    questionId={initialQuestionId}
    variant="static"
    initialSqlParameters={initialSqlParameters}
    withDownloads={withDownloads}
  >
    <Stack gap="sm">
      <Group justify="space-between">
        {withChartTypeSelector && <InteractiveQuestion.ChartTypeDropdown />}
        {withDownloads && <InteractiveQuestion.DownloadWidgetDropdown />}
      </Group>
      <InteractiveQuestion.QuestionVisualization
        height={height}
        width={width}
        className={className}
        style={style}
      />
    </Stack>
  </InteractiveQuestionProvider>
);

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = withPublicComponentWrapper(StaticQuestionInner);
