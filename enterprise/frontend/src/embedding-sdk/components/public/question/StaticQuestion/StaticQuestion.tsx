import { StaticQuestionSdkMode } from "embedding-sdk/components/public/question/StaticQuestion/mode";
import { Group, Stack } from "metabase/ui";

import { SdkQuestion, type SdkQuestionProps } from "../SdkQuestion";

/**
 * @interface
 * @expand
 * @category StaticQuestion
 */
export type StaticQuestionProps = Pick<
  SdkQuestionProps,
  | "questionId"
  | "height"
  | "width"
  | "className"
  | "style"
  | "initialSqlParameters"
  | "withDownloads"
  | "children"
> & {
  withChartTypeSelector?: boolean;
};

const StaticQuestionInner = ({
  questionId,
  withChartTypeSelector,
  height,
  width,
  className,
  style,
  initialSqlParameters,
  withDownloads,
  children,
}: StaticQuestionProps): JSX.Element | null => (
  <SdkQuestion
    questionId={questionId}
    initialSqlParameters={initialSqlParameters}
    withDownloads={withDownloads}
    enableNavigationToNewCard={false}
    mode={StaticQuestionSdkMode}
  >
    {children ?? (
      <Stack gap="sm" w="100%" h="100%">
        {(withChartTypeSelector || withDownloads) && (
          <Group justify="space-between">
            {withChartTypeSelector && <SdkQuestion.ChartTypeDropdown />}
            {withDownloads && <SdkQuestion.DownloadWidgetDropdown />}
          </Group>
        )}
        <SdkQuestion.QuestionVisualization
          height={height}
          width={width}
          className={className}
          style={style}
        />
      </Stack>
    )}
  </SdkQuestion>
);

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion =
  StaticQuestionInner as typeof StaticQuestionInner & {
    Title: typeof SdkQuestion.Title;
    QuestionVisualization: typeof SdkQuestion.QuestionVisualization;
    ChartTypeSelector: typeof SdkQuestion.ChartTypeSelector;
    ChartTypeDropdown: typeof SdkQuestion.ChartTypeDropdown;
    QuestionSettings: typeof SdkQuestion.QuestionSettings;
    QuestionSettingsDropdown: typeof SdkQuestion.QuestionSettingsDropdown;
    DownloadWidget: typeof SdkQuestion.DownloadWidget;
    DownloadWidgetDropdown: typeof SdkQuestion.DownloadWidgetDropdown;
  };

StaticQuestion.Title = SdkQuestion.Title;
StaticQuestion.QuestionSettings = SdkQuestion.QuestionSettings;
StaticQuestion.ChartTypeSelector = SdkQuestion.ChartTypeSelector;
StaticQuestion.ChartTypeDropdown = SdkQuestion.ChartTypeDropdown;
StaticQuestion.QuestionSettings = SdkQuestion.QuestionSettings;
StaticQuestion.QuestionSettingsDropdown = SdkQuestion.QuestionSettingsDropdown;
StaticQuestion.DownloadWidget = SdkQuestion.DownloadWidget;
StaticQuestion.DownloadWidgetDropdown = SdkQuestion.DownloadWidgetDropdown;
