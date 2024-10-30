import { useMemo } from "react";

import {
  type InteractiveQuestionContextType,
  useInteractiveQuestionContext,
} from "embedding-sdk/components/private/InteractiveQuestion/context";
import { BaseChartSettings } from "metabase/visualizations/components/ChartSettings/BaseChartSettings";
import { useChartSettingsState } from "metabase/visualizations/components/ChartSettings/hooks";
import type { Widget } from "metabase/visualizations/components/ChartSettings/types";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

export const QuestionSettingInner = ({
  settingKey,
  question,
  queryResults,
  updateQuestion,
}: {
  settingKey: keyof VisualizationSettings;
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

  const widget = useMemo(
    () =>
      getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        false,
      ).find((widget: Widget) => widget.id === settingKey),
    [transformedSeries, handleChangeSettings, settingKey],
  );

  return widget && widget.widget ? (
    <BaseChartSettings
      question={question}
      series={series}
      onChange={onChange}
      chartSettings={chartSettings}
      transformedSeries={transformedSeries}
      widgets={[widget]}
    />
  ) : null;
};

export const QuestionSetting = ({
  settingKey,
}: {
  settingKey: keyof VisualizationSettings;
}) => {
  const { question, queryResults, updateQuestion } =
    useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <QuestionSettingInner
      settingKey={settingKey}
      question={question}
      queryResults={queryResults}
      updateQuestion={updateQuestion}
    />
  );
};
