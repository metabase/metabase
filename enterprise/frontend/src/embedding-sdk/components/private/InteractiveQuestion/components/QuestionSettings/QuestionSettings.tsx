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
export const QuestionSettingsInner = ({
  question,
  queryResults,
  updateQuestion,
}: {
  question: Question;
  queryResults?: any[];
  updateQuestion: InteractiveQuestionContextType["updateQuestion"];
}) => {
  const card = question.card();
  const result = useMemo(() => queryResults?.[0] ?? {}, [queryResults]);

  const series = useMemo(() => {
    return [
      {
        ...result,
        card,
      },
    ];
  }, [card, result]);

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
    <QuestionSettingsInner
      question={question}
      queryResults={queryResults}
      updateQuestion={updateQuestion}
    />
  );
};
