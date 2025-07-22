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
export type StaticQuestionProps = SdkQuestionProps;

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = ({
  questionId: initialQuestionId,
  withChartTypeSelector,
  height,
  width,
  className,
  style,
  initialSqlParameters,
  withDownloads,
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
    </SdkQuestion>
  );
};
