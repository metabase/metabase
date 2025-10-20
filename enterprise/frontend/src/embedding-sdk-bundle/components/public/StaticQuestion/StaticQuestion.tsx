import type { PropsWithChildren } from "react";

import { FlexibleSizeComponent } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";
import {
  Breakout,
  BreakoutDropdown,
  ChartTypeDropdown,
  ChartTypeSelector,
  DownloadWidget,
  DownloadWidgetDropdown,
  Filter,
  FilterDropdown,
  QuestionResetButton,
  QuestionSettings,
  QuestionSettingsDropdown,
  QuestionVisualization,
  Summarize,
  SummarizeDropdown,
  Title,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components";
import { DefaultViewTitle } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView/DefaultViewTitle";
import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";
import { StaticQuestionSdkMode } from "embedding-sdk-bundle/components/public/StaticQuestion/mode";
import { Group, Stack } from "metabase/ui";
import { getEmbeddingMode } from "metabase/visualizations/click-actions/lib/modes";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

/**
 * @interface
 * @expand
 * @category StaticQuestion
 */
export type StaticQuestionProps = PropsWithChildren<
  Pick<
    SdkQuestionProps,
    | "questionId"
    | "withChartTypeSelector"
    | "height"
    | "width"
    | "className"
    | "style"
    | "initialSqlParameters"
    | "withDownloads"
    | "title"
  >
>;

const StaticQuestionInner = ({
  questionId,
  withChartTypeSelector,
  height,
  width,
  className,
  style,
  initialSqlParameters,
  withDownloads,
  title = false, // Hidden by default for backwards-compatibility.
  children,
}: StaticQuestionProps): JSX.Element | null => {
  const getClickActionMode: ClickActionModeGetter = ({
    question,
  }: {
    question: Question;
  }) => {
    return (
      question &&
      getEmbeddingMode({
        question,
        queryMode: StaticQuestionSdkMode,
      })
    );
  };

  return (
    <SdkQuestion
      questionId={questionId}
      getClickActionMode={getClickActionMode}
      navigateToNewCard={null}
      initialSqlParameters={initialSqlParameters}
      withDownloads={withDownloads}
    >
      {children ?? (
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
        </FlexibleSizeComponent>
      )}
    </SdkQuestion>
  );
};

/**
 * A question component without drill-downs.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion =
  StaticQuestionInner as typeof StaticQuestionInner & {
    Filter: typeof Filter;
    FilterDropdown: typeof FilterDropdown;
    ResetButton: typeof QuestionResetButton;
    Title: typeof Title;
    Summarize: typeof Summarize;
    SummarizeDropdown: typeof SummarizeDropdown;
    QuestionVisualization: typeof QuestionVisualization;
    ChartTypeSelector: typeof ChartTypeSelector;
    ChartTypeDropdown: typeof ChartTypeDropdown;
    QuestionSettings: typeof QuestionSettings;
    QuestionSettingsDropdown: typeof QuestionSettingsDropdown;
    Breakout: typeof Breakout;
    BreakoutDropdown: typeof BreakoutDropdown;
    DownloadWidget: typeof DownloadWidget;
    DownloadWidgetDropdown: typeof DownloadWidgetDropdown;
  };

StaticQuestion.Filter = Filter;
StaticQuestion.FilterDropdown = FilterDropdown;
StaticQuestion.ResetButton = QuestionResetButton;
StaticQuestion.Title = Title;
StaticQuestion.Summarize = Summarize;
StaticQuestion.SummarizeDropdown = SummarizeDropdown;
StaticQuestion.QuestionVisualization = QuestionVisualization;
StaticQuestion.ChartTypeSelector = ChartTypeSelector;
StaticQuestion.QuestionSettings = QuestionSettings;
StaticQuestion.QuestionSettingsDropdown = QuestionSettingsDropdown;
StaticQuestion.BreakoutDropdown = BreakoutDropdown;
StaticQuestion.Breakout = Breakout;
StaticQuestion.ChartTypeDropdown = ChartTypeDropdown;
StaticQuestion.DownloadWidget = DownloadWidget;
StaticQuestion.DownloadWidgetDropdown = DownloadWidgetDropdown;
