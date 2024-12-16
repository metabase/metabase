import { useMemo } from "react";

import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";

import { BaseChartSettings } from "../BaseChartSettings";
import { ChartSettingsRoot } from "../ChartSettings.styled";
import { useChartSettingsState } from "../hooks";

import type { QuestionChartSettingsProps } from "./types";

export const QuestionChartSettings = ({
  question,
  widgets: propWidgets,
  series,
  onChange,
  computedSettings,
  initial,
}: QuestionChartSettingsProps) => {
  const { chartSettings, handleChangeSettings, transformedSeries } =
    useChartSettingsState({ series, onChange });

  const widgets = useMemo(
    () =>
      propWidgets ||
      getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        false,
      ),
    [propWidgets, transformedSeries, handleChangeSettings],
  );

  return (
    <ChartSettingsRoot>
      <BaseChartSettings
        question={question}
        series={series}
        onChange={onChange}
        initial={initial}
        computedSettings={computedSettings}
        chartSettings={chartSettings}
        transformedSeries={transformedSeries}
        widgets={widgets}
      />
    </ChartSettingsRoot>
  );
};
