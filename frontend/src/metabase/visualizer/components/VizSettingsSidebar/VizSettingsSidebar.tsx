import { forwardRef, useCallback, useMemo, useState } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Center } from "metabase/ui";
import {
  BaseChartSettings,
  type Widget,
} from "metabase/visualizations/components/ChartSettings";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import {
  getVisualizerComputedSettings,
  getVisualizerRawSeries,
  getVisualizerTransformedSeries,
} from "metabase/visualizer/selectors";
import { updateSettings } from "metabase/visualizer/visualizer.slice";
import type { VisualizationSettings } from "metabase-types/api";

import { SeriesSettings } from "./SeriesSettings";

const HIDDEN_SETTING_WIDGETS = [
  "card.title",
  "card.description",
  "card.hide_empty",
];

export function VizSettingsSidebar({ className }: { className?: string }) {
  const series = useSelector(getVisualizerRawSeries);
  const transformedSeries = useSelector(getVisualizerTransformedSeries);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const [error, setError] = useState<Error | null>(null);

  const handleChangeSettings = useCallback(
    (settings: VisualizationSettings) => {
      dispatch(updateSettings(settings));
    },
    [dispatch],
  );

  const [currentWidget, setCurrentWidget] = useState<Widget | null>(null);

  const onShowWidget = useCallback((widget: Widget | null) => {
    setCurrentWidget(widget);
  }, []);

  const widgets = useMemo(() => {
    if (transformedSeries.length === 0) {
      return [];
    }

    try {
      setError(null);
      const widgets = getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        false,
      );
      return widgets.filter(
        (widget) => !HIDDEN_SETTING_WIDGETS.includes(widget.id),
      );
    } catch (error) {
      setError(error as Error);
      return [];
    }
  }, [transformedSeries, handleChangeSettings]);

  return error ? (
    <ErrorComponent message={error.message} />
  ) : (
    <ErrorBoundary errorComponent={ErrorComponent}>
      {currentWidget ? (
        <SeriesSettings
          currentWidget={currentWidget}
          widgets={widgets}
          display={settings["card.display"]}
          computedSettings={settings}
          transformedSeries={transformedSeries}
          onCloseClick={() => setCurrentWidget(null)}
        />
      ) : (
        <BaseChartSettings
          series={series}
          transformedSeries={transformedSeries}
          chartSettings={settings}
          widgets={widgets}
          onChange={handleChangeSettings}
          className={className}
          onShowWidget={onShowWidget}
        />
      )}
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
