import { useMemo } from "react";

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

  const widgets = useMemo(
    () =>
      // TODO: Create a way to just get a single widget and its dependencies
      getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        false,
      ).filter(w => !!w.widget),
    [transformedSeries, handleChangeSettings],
  );

  return (
    <BaseChartSettings
      question={question}
      series={series}
      onChange={onChange}
      chartSettings={chartSettings}
      transformedSeries={transformedSeries}
      widgets={widgets}
    />
  );
};

export const QuestionSettings = () => {
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
    />
  );
};
