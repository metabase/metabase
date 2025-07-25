import type { PropsWithChildren } from "react";

import { FlexibleSizeComponent } from "embedding-sdk/components/private/FlexibleSizeComponent";
import { DefaultViewTitle } from "embedding-sdk/components/private/SdkQuestionDefaultView/DefaultViewTitle";
import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { StaticQuestionSdkMode } from "embedding-sdk/components/public/StaticQuestion/mode";
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

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
const _StaticQuestion = ({
  questionId: initialQuestionId,
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
      questionId={initialQuestionId}
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
          <Stack gap="sm">
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

export const StaticQuestion = _StaticQuestion as typeof _StaticQuestion & {
  Filter: typeof SdkQuestion.Filter;
  FilterDropdown: typeof SdkQuestion.FilterDropdown;
  ResetButton: typeof SdkQuestion.ResetButton;
  Title: typeof SdkQuestion.Title;
  Summarize: typeof SdkQuestion.Summarize;
  SummarizeDropdown: typeof SdkQuestion.SummarizeDropdown;
  QuestionVisualization: typeof SdkQuestion.QuestionVisualization;
  ChartTypeSelector: typeof SdkQuestion.ChartTypeSelector;
  ChartTypeDropdown: typeof SdkQuestion.ChartTypeDropdown;
  QuestionSettings: typeof SdkQuestion.QuestionSettings;
  QuestionSettingsDropdown: typeof SdkQuestion.QuestionSettingsDropdown;
  Breakout: typeof SdkQuestion.Breakout;
  BreakoutDropdown: typeof SdkQuestion.BreakoutDropdown;
  DownloadWidget: typeof SdkQuestion.DownloadWidget;
  DownloadWidgetDropdown: typeof SdkQuestion.DownloadWidgetDropdown;
};

StaticQuestion.Filter = SdkQuestion.Filter;
StaticQuestion.FilterDropdown = SdkQuestion.FilterDropdown;
StaticQuestion.ResetButton = SdkQuestion.ResetButton;
StaticQuestion.Title = SdkQuestion.Title;
StaticQuestion.Summarize = SdkQuestion.Summarize;
StaticQuestion.SummarizeDropdown = SdkQuestion.SummarizeDropdown;
StaticQuestion.QuestionVisualization = SdkQuestion.QuestionVisualization;
StaticQuestion.ChartTypeSelector = SdkQuestion.ChartTypeSelector;
StaticQuestion.QuestionSettings = SdkQuestion.QuestionSettings;
StaticQuestion.QuestionSettingsDropdown = SdkQuestion.QuestionSettingsDropdown;
StaticQuestion.BreakoutDropdown = SdkQuestion.BreakoutDropdown;
StaticQuestion.Breakout = SdkQuestion.Breakout;
StaticQuestion.ChartTypeDropdown = SdkQuestion.ChartTypeDropdown;
StaticQuestion.DownloadWidget = SdkQuestion.DownloadWidget;
StaticQuestion.DownloadWidgetDropdown = SdkQuestion.DownloadWidgetDropdown;
