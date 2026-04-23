import { BaseChartSettings } from "../BaseChartSettings";
import { useChartSettingsState, useSettingsWidgets } from "../hooks";

import type { QuestionChartSettingsProps } from "./types";

export const QuestionChartSettings = ({
  question,
  series,
  onChange,
  computedSettings,
  initial,
  className,
}: QuestionChartSettingsProps & { className?: string }) => {
  const { chartSettings, handleChangeSettings, transformedSeries } =
    useChartSettingsState({ series, onChange });

  const widgets = useSettingsWidgets({
    series,
    transformedSeries,
    handleChangeSettings,
  });

  return (
    <BaseChartSettings
      question={question}
      series={series}
      onChange={onChange}
      initial={initial}
      computedSettings={computedSettings}
      chartSettings={chartSettings}
      transformedSeries={transformedSeries}
      widgets={widgets}
      className={className}
      w="100%"
    />
  );
};
