import { useCallback, useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { BaseChartSettings } from "metabase/visualizations/components/ChartSettings";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import {
  getVisualizerComputedSettings,
  getVisualizerRawSeries,
} from "metabase/visualizer/selectors";
import { updateSettings } from "metabase/visualizer/visualizer.slice";
import type { VisualizationSettings } from "metabase-types/api";

const HIDDEN_SETTING_WIDGETS = [
  "card.title",
  "card.description",
  "card.hide_empty",
];

export function VizSettingsSidebar({ className }: { className?: string }) {
  const series = useSelector(getVisualizerRawSeries);
  const transformedSeries = useSelector(getVisualizerRawSeries);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const handleChangeSettings = useCallback(
    (settings: VisualizationSettings) => {
      dispatch(updateSettings(settings));
    },
    [dispatch],
  );

  const widgets = useMemo(() => {
    if (transformedSeries.length === 0) {
      return [];
    }

    const widgets = getSettingsWidgetsForSeries(
      transformedSeries,
      handleChangeSettings,
      true,
    );
    return widgets.filter(
      widget => !HIDDEN_SETTING_WIDGETS.includes(widget.id),
    );
  }, [transformedSeries, handleChangeSettings]);

  return (
    <BaseChartSettings
      series={series}
      transformedSeries={transformedSeries}
      chartSettings={settings}
      widgets={widgets}
      onChange={handleChangeSettings}
      className={className}
    />
  );
}
