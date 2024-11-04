import { useMemo } from "react";

import {
  BaseChartSettings,
  type Widget,
  useChartSettingsState,
} from "metabase/visualizations/components/ChartSettings";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type Question from "metabase-lib/v1/Question";
import type {
  VisualizationSettingKey,
  VisualizationSettings,
} from "metabase-types/api";

import {
  type InteractiveQuestionContextType,
  useInteractiveQuestionContext,
} from "../../context";

import {
  type QuestionSettingKey,
  VisualizationSettingsDisplayNames,
} from "./viz-key-translation";

export const QuestionSettingInner = ({
  settingKey,
  question,
  queryResults,
  updateQuestion,
}: {
  settingKey: VisualizationSettingKey;
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
      // TODO: Create a way to just get a single widget and its dependencies
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
  settingKey: QuestionSettingKey;
}) => {
  const vizSettingKey = VisualizationSettingsDisplayNames[settingKey];

  const { question, queryResults, updateQuestion } =
    useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <QuestionSettingInner
      settingKey={vizSettingKey}
      question={question}
      queryResults={queryResults}
      updateQuestion={updateQuestion}
    />
  );
};
