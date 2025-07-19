import type { FlexibleSizeProps } from "embedding-sdk/components/private/FlexibleSizeComponent";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  SdkQuestionProvider,
  type SdkQuestionProviderProps,
} from "embedding-sdk/components/private/SdkQuestion/context";
import { Group, Stack } from "metabase/ui";

import { InteractiveQuestion } from "../SdkQuestion";
import type { SdkQuestionIdProps } from "../SdkQuestion/types";

/**
 * @interface
 * @expand
 * @category StaticQuestion
 */
export type StaticQuestionProps = SdkQuestionIdProps & {
  withChartTypeSelector?: boolean;
} & Pick<SdkQuestionProviderProps, "initialSqlParameters" | "withDownloads"> &
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
  <SdkQuestionProvider
    questionId={initialQuestionId}
    variant="static"
    initialSqlParameters={initialSqlParameters}
    withDownloads={withDownloads}
  >
    <Stack gap="sm" w="100%" h="100%">
      {(withChartTypeSelector || withDownloads) && (
        <Group justify="space-between">
          {withChartTypeSelector && <InteractiveQuestion.ChartTypeDropdown />}
          {withDownloads && <InteractiveQuestion.DownloadWidgetDropdown />}
        </Group>
      )}
      <InteractiveQuestion.QuestionVisualization
        height={height}
        width={width}
        className={className}
        style={style}
      />
    </Stack>
  </SdkQuestionProvider>
);

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = withPublicComponentWrapper(StaticQuestionInner);
