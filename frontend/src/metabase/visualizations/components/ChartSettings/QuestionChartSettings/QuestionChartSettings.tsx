import { BaseChartSettings } from "../BaseChartSettings";
import { useChartSettingsState } from "../hooks";
import type { ChartSettingsProps } from "../types";

// section names are localized

export const QuestionChartSettings = ({
  initial,
  settings,
  series,
  computedSettings: propComputedSettings,
  onChange,
  isDashboard = false,
  dashboard,
  question,
  widgets: propWidgets,
}: ChartSettingsProps) => {
  const {
    chartSettings,
    transformedSeries,
    widgets: finalWidgetList,
  } = useChartSettingsState({
    settings,
    series,
    onChange,
    isDashboard,
    dashboard,
    widgets: propWidgets,
  });

  return (
    <BaseChartSettings
      question={question}
      finalWidgetList={finalWidgetList}
      chartSettings={chartSettings}
      transformedSeries={transformedSeries}
      initial={initial}
      onChange={onChange}
      series={series}
      computedSettings={propComputedSettings}
    />
  );
};
