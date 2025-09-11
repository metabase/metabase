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

import { staticQuestionSchema } from "./StaticQuestion.schema";

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
 * @interface
 */
export type StaticQuestionComponents = {
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

const subComponents: StaticQuestionComponents = {
  Filter: Filter,
  FilterDropdown: FilterDropdown,
  ResetButton: QuestionResetButton,
  Title: Title,
  Summarize: Summarize,
  SummarizeDropdown: SummarizeDropdown,
  QuestionVisualization: QuestionVisualization,
  ChartTypeSelector: ChartTypeSelector,
  ChartTypeDropdown: ChartTypeDropdown,
  QuestionSettings: QuestionSettings,
  QuestionSettingsDropdown: QuestionSettingsDropdown,
  Breakout: Breakout,
  BreakoutDropdown: BreakoutDropdown,
  DownloadWidget: DownloadWidget,
  DownloadWidgetDropdown: DownloadWidgetDropdown,
};

export const StaticQuestion = Object.assign(_StaticQuestion, subComponents, {
  schema: staticQuestionSchema,
});
