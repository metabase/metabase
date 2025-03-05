import { useMemo } from "react";

import type { StackProps } from "metabase/ui";
import {
  BaseChartSettings,
  useChartSettingsState,
} from "metabase/visualizations/components/ChartSettings";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import {
  type InteractiveQuestionContextType,
  useInteractiveQuestionContext,
} from "../../context";

const QuestionSettingsContent = ({
  question,
  queryResults,
  updateQuestion,
  ...stackProps
}: {
  question: Question;
  queryResults?: any[];
  updateQuestion: InteractiveQuestionContextType["updateQuestion"];
}) => {
  const series = useMemo(() => {
    const result = queryResults?.[0] ?? {};
    return [
      {
        ...result,
        card: question.card(),
      },
    ];
  }, [queryResults, question]);

  const onChange = async (settings: VisualizationSettings) => {
    await updateQuestion(question.updateSettings(settings).lockDisplay());
  };

  const { chartSettings, handleChangeSettings, transformedSeries } =
    useChartSettingsState({ series, onChange });

  const widgets = useMemo(() => {
    try {
      // TODO: Create a way to just get a single widget and its dependencies
      return getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        false,
      ).filter(w => !!w.widget);
    } catch (e) {
      return [];
    }
  }, [transformedSeries, handleChangeSettings]);

  return (
    <BaseChartSettings
      {...stackProps}
      question={question}
      series={series}
      onChange={onChange}
      chartSettings={chartSettings}
      transformedSeries={transformedSeries}
      widgets={widgets}
    />
  );
};

export const QuestionSettings = (stackProps: StackProps) => {
  const { question, queryResults, updateQuestion } =
    useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <QuestionSettingsContent
      question={question}
      queryResults={queryResults}
      updateQuestion={updateQuestion}
      {...stackProps}
    />
  );
};
