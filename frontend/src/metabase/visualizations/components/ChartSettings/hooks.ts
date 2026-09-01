import { assocIn } from "icepick";
import { useCallback, useMemo } from "react";

import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins/oss/custom-viz";
import {
  extractRemappings,
  getVisualizationRaw,
  getVisualizationTransformed,
} from "metabase/visualizations";
import { updateSettings } from "metabase/visualizations/lib/settings";
import { getStoredSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/widgets";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  SettingsExtra,
  Widget,
} from "metabase/visualizations/types/definition";
import type Question from "metabase-lib/v1/Question";
import type {
  RawSeries,
  Series,
  TransformedSeries,
  VisualizationSettings,
} from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards";

export type UseChartSettingsStateProps = {
  settings?: VisualizationSettings;
  series: Series;
  onChange?: (
    settings: ComputedVisualizationSettings,
    question?: Question,
  ) => void;
};

export type UseChartSettingsStateReturned = {
  chartSettings?: VisualizationSettings;
  handleChangeSettings: (
    changedSettings: VisualizationSettings,
    question?: Question,
  ) => void;
  chartSettingsRawSeries: Series;
  transformedSeries?: RawSeries | TransformedSeries;
};

export const useChartSettingsState = ({
  settings,
  series,
  onChange,
}: UseChartSettingsStateProps): UseChartSettingsStateReturned => {
  const display = series[0]?.card?.display;
  // For a custom viz this is defined only once the plugin bundle has loaded and registered.
  // The registry isn't reactive, so a registration is picked up on the re-render that
  // `useAutoLoadCustomVizPlugin` (in `useSettingsWidgets`) triggers when loading finishes.
  const visualization = getVisualizationRaw(series);
  const chartSettings = useMemo(() => {
    if (settings) {
      return settings;
    }

    // Only custom viz needs the stored-settings migration, and only once its plugin has
    // registered its setting definitions. Every other case keeps the raw stored settings
    // so an unrelated edit doesn't rewrite the stored shape.
    if (!isCustomVizDisplay(display) || !visualization) {
      return series[0].card.visualization_settings;
    }

    return getStoredSettingsForSeries(series);
  }, [series, settings, display, visualization]);

  const handleChangeSettings = useCallback(
    (changedSettings: VisualizationSettings, question?: Question) => {
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

export function useSettingsWidgets({
  series,
  transformedSeries,
  handleChangeSettings,
  isDashboard = false,
  extra,
}: {
  series: Series;
  transformedSeries?: RawSeries | TransformedSeries;
  handleChangeSettings: (settings: VisualizationSettings) => void;
  isDashboard?: boolean;
  extra?: SettingsExtra;
}): Widget[] {
  const display = series?.[0]?.card?.display;
  const { loading: customVizLoading } =
    PLUGIN_CUSTOM_VIZ.useAutoLoadCustomVizPlugin(display);

  const widgets = useMemo(
    () =>
      customVizLoading
        ? []
        : getSettingsWidgetsForSeries(
            transformedSeries,
            handleChangeSettings,
            isDashboard,
            extra,
          ),
    [
      customVizLoading,
      transformedSeries,
      handleChangeSettings,
      isDashboard,
      extra,
    ],
  );

  return widgets;
}
