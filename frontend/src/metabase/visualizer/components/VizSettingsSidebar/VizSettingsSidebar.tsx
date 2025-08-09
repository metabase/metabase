import { forwardRef, useCallback, useMemo, useState } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Center } from "metabase/ui";
import { BaseChartSettings } from "metabase/visualizations/components/ChartSettings";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import {
  getComputedSettingsForSeries,
  getSettingsWidgetsForSeries,
} from "metabase/visualizations/lib/settings/visualization";
import {
  getVisualizerAllAvailableRawSeries,
  getVisualizerAllAvailableTransformedSeries,
  getVisualizerComputedSettings,
  getVisualizerRawSeries,
  getVisualizerTransformedSeries,
} from "metabase/visualizer/selectors";
import { updateSettings } from "metabase/visualizer/visualizer.slice";
import type { VisualizationSettings } from "metabase-types/api";

const HIDDEN_SETTING_WIDGETS = ["card.title", "card.description"];

export function VizSettingsSidebar({ className }: { className?: string }) {
  const series = useSelector(getVisualizerRawSeries);
  const transformedSeries = useSelector(getVisualizerTransformedSeries);
  const allAvailableSeries = useSelector(getVisualizerAllAvailableRawSeries);
  const allAvailableTransformedSeries = useSelector(
    getVisualizerAllAvailableTransformedSeries,
  );

  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const allAvailableSeriesSettings =
    series.length > 0
      ? getComputedSettingsForSeries(allAvailableTransformedSeries)
      : {};

  const [error, setError] = useState<Error | null>(null);

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

    try {
      setError(null);
      const widgets = getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        true,
      );

      // patch widgets here, to inject custom series options for tooltip
      return widgets.filter(
        (widget) => !HIDDEN_SETTING_WIDGETS.includes(widget.id),
      );
    } catch (error) {
      setError(error as Error);
      return [];
    }
  }, [transformedSeries, handleChangeSettings]);

  const allSeriesWidgets = useMemo(() => {
    if (allAvailableTransformedSeries.length === 0) {
      return [];
    }

    try {
      setError(null);
      const widgets = getSettingsWidgetsForSeries(
        allAvailableTransformedSeries,
        handleChangeSettings,
        true,
      );

      // patch widgets here, to inject custom series options for tooltip
      return widgets.filter((widget) => widget.id === "graph.tooltip_columns");
    } catch (error) {
      setError(error as Error);
      return [];
    }
  }, [allAvailableTransformedSeries, handleChangeSettings]);

  console.log("VizSettingsSidebar", {
    widgets,
    allAvailableSeries,
    allAvailableTransformedSeries,
    allAvailableSeriesSettings,
  });

  return error ? (
    <ErrorComponent message={error.message} />
  ) : (
    <ErrorBoundary errorComponent={ErrorComponent}>
      <BaseChartSettings
        series={series}
        transformedSeries={transformedSeries}
        chartSettings={settings}
        widgets={widgets}
        onChange={handleChangeSettings}
        className={className}
      />
      <div>--------------</div>
      <BaseChartSettings
        series={allAvailableSeries}
        transformedSeries={allAvailableTransformedSeries}
        chartSettings={allAvailableSeriesSettings}
        widgets={allSeriesWidgets}
        onChange={handleChangeSettings}
        className={className}
      />
    </ErrorBoundary>
  );
}

const ErrorComponent = forwardRef<HTMLDivElement, { message?: string }>(
  function ErrorComponent({ message }, ref) {
    return (
      <Center style={{ height: "100%" }}>
        <ErrorView ref={ref} isSmall isDashboard error={message} />
      </Center>
    );
  },
);
