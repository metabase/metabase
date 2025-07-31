import type { PropsWithChildren } from "react";

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
} from "embedding-sdk/components/private/SdkQuestion/components";
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
  >
>;

const _StaticQuestion = ({
  questionId: initialQuestionId,
  withChartTypeSelector,
  height,
  width,
  className,
  style,
  initialSqlParameters,
  withDownloads,
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
        <Stack gap="sm" w="100%" h="100%">
          {(withChartTypeSelector || withDownloads) && (
            <Group justify="space-between">
              {withChartTypeSelector && (
                <Group gap="xs">
                  <SdkQuestion.ChartTypeDropdown />
                  <SdkQuestion.QuestionSettingsDropdown />
                </Group>
              )}
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
};

/**
 * A question component without drill-downs.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = _StaticQuestion as typeof _StaticQuestion & {
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
