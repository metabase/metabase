import { assocIn } from "icepick";
import { useCallback, useMemo } from "react";

import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import { updateSettings } from "metabase/visualizations/lib/settings";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import type {
  UseChartSettingsStateProps,
  UseChartSettingsStateReturned,
} from "./types";

export const useChartSettingsState = ({
  settings,
  series,
  onChange,
}: UseChartSettingsStateProps): UseChartSettingsStateReturned => {
  const chartSettings = useMemo(
    () => settings || series[0].card.visualization_settings,
    [series, settings],
  );

  const handleChangeSettings = useCallback(
    (changedSettings: VisualizationSettings, question: Question) => {
      onChange?.(updateSettings(chartSettings, changedSettings), question);
    },
    [chartSettings, onChange],
  );

  const chartSettingsRawSeries = useMemo(
    () => assocIn(series, [0, "card", "visualization_settings"], chartSettings),
    [chartSettings, series],
  );

  const transformedSeries = useMemo(() => {
    const { series: transformedSeries } = getVisualizationTransformed(
      extractRemappings(chartSettingsRawSeries),
    );
    return transformedSeries;
  }, [chartSettingsRawSeries]);

  return {
    chartSettings,
    handleChangeSettings,
    chartSettingsRawSeries,
    transformedSeries,
  };
};
