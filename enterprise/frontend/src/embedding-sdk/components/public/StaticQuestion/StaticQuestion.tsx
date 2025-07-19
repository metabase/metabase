import {
  FlexibleSizeComponent,
  type FlexibleSizeProps,
} from "embedding-sdk/components/private/FlexibleSizeComponent";
import { withPublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";
import {
  SdkQuestionProvider,
  type SdkQuestionProviderProps,
} from "embedding-sdk/components/private/SdkQuestion/context";
import type { InteractiveQuestionDefaultViewProps } from "embedding-sdk/components/private/SdkQuestionDefaultView";
import { DefaultViewTitle } from "embedding-sdk/components/private/SdkQuestionDefaultView/DefaultViewTitle";
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
  Pick<InteractiveQuestionDefaultViewProps, "title"> &
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

  // Hidden by default for backwards-compatibility.
  title = false,
}: StaticQuestionProps): JSX.Element | null => (
  <SdkQuestionProvider
    questionId={initialQuestionId}
    variant="static"
    initialSqlParameters={initialSqlParameters}
    withDownloads={withDownloads}
  >
    <FlexibleSizeComponent
      width={width}
      height={height}
      className={className}
      style={style}
    >
      <Stack gap="sm" w="100%" h="100%">
        {title && <DefaultViewTitle title={title} />}

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
    </FlexibleSizeComponent>
  </SdkQuestionProvider>
);

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = withPublicComponentWrapper(StaticQuestionInner);
