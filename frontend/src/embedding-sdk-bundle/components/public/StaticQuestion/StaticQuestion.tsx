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
  SqlParametersList,
  Summarize,
  SummarizeDropdown,
  Title,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components";
import { ResultToolbar } from "embedding-sdk-bundle/components/private/SdkQuestion/components/ResultToolbar/ResultToolbar";
import { DefaultViewTitle } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView/DefaultViewTitle";
import InteractiveQuestionS from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView/SdkQuestionDefaultView.module.css";
import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";
import { StaticQuestionSdkMode } from "embedding-sdk-bundle/components/public/StaticQuestion/mode";
import { Box, Stack } from "metabase/ui";
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
    | "hiddenParameters"
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
  SqlParametersList: typeof SqlParametersList;
};

const StaticQuestionInner = ({
  questionId,
  withChartTypeSelector,
  height,
  width,
  className,
  style,
  initialSqlParameters,
  hiddenParameters,
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

  const hasTopBar = Boolean(title || withChartTypeSelector || withDownloads);

  return (
    <SdkQuestion
      questionId={questionId}
      getClickActionMode={getClickActionMode}
      navigateToNewCard={null}
      initialSqlParameters={initialSqlParameters}
      hiddenParameters={hiddenParameters}
      withDownloads={withDownloads}
    >
      {children ?? (
        <FlexibleSizeComponent
          className={className}
          width={width}
          height={height}
          style={style}
        >
          <Stack
            className={InteractiveQuestionS.Container}
            w="100%"
            h="100%"
            gap="xs"
          >
            {hasTopBar && (
              <Stack className={InteractiveQuestionS.TopBar} gap="sm" p="md">
                {title && <DefaultViewTitle title={title} />}

                {(withChartTypeSelector || withDownloads) && (
                  <ResultToolbar>
                    {withChartTypeSelector && <SdkQuestion.ChartTypeDropdown />}
                    {withDownloads && <SdkQuestion.DownloadWidgetDropdown />}
                  </ResultToolbar>
                )}
              </Stack>
            )}

            <Box className={InteractiveQuestionS.Main} w="100%" h="100%">
              <Box className={InteractiveQuestionS.Content}>
                <SdkQuestion.QuestionVisualization
                  height={height}
                  width={width}
                  className={className}
                  style={style}
                />
              </Box>
            </Box>
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
  SqlParametersList: SqlParametersList,
};

export const StaticQuestion = Object.assign(
  StaticQuestionInner,
  subComponents,
  { schema: staticQuestionSchema },
);
