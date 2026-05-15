import { forwardRef, useCallback, useMemo } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useDispatch, useSelector } from "metabase/redux";
import { Center } from "metabase/ui";
import { BaseChartSettings } from "metabase/visualizations/components/ChartSettings";
import { ErrorView } from "metabase/visualizations/components/Visualization/ErrorView";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import {
  getVisualizerComputedSettings,
  getVisualizerRawSeries,
  getVisualizerTransformedSeries,
} from "metabase/visualizer/selectors";
import { updateSettings } from "metabase/visualizer/visualizer.slice";
import type { VisualizationSettings } from "metabase-types/api";

const HIDDEN_SETTING_WIDGETS = ["card.title"];

export function VizSettingsSidebar({ className }: { className?: string }) {
  const series = useSelector(getVisualizerRawSeries);
  const transformedSeries = useSelector(getVisualizerTransformedSeries);
  const settings = useSelector(getVisualizerComputedSettings);
  const dispatch = useDispatch();

  const handleChangeSettings = useCallback(
    (settings: VisualizationSettings) => {
      dispatch(updateSettings(settings));
    },
    [dispatch],
  );

  const { widgets, error } = useMemo(() => {
    if (transformedSeries.length === 0) {
      return { widgets: [], error: null };
    }

    try {
      const widgets = getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        true,
      );
      return {
        widgets: widgets.filter(
          (widget) =>
            typeof widget.id !== "string" ||
            !HIDDEN_SETTING_WIDGETS.includes(widget.id),
        ),
        error: null,
      };
    } catch (error) {
      return { widgets: [], error: error as Error };
    }
  }, [transformedSeries, handleChangeSettings]);

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
