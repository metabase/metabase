import { useCallback, useMemo } from "react";

import { useDispatch, useSelector } from "metabase/redux";
import { Stack } from "metabase/ui";
import { BaseChartSettings } from "metabase/visualizations/components/ChartSettings";
import { useChartSettingsSections } from "metabase/visualizations/components/ChartSettings/BaseChartSettings/hooks";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import {
  getVisualizerComputedSettings,
  getVisualizerRawSeries,
  getVisualizerRawSettings,
  getVisualizerTransformedSeries,
} from "metabase/visualizer/selectors";
import { updateSettings } from "metabase/visualizer/visualizer.slice";
import {
  type ComputedVisualizationSettings,
  SERIES_SETTING_KEY,
  type VisualizationSettingsDefinitions,
  type Widget,
  getSettingsWidgets,
  getSettingsWidgetsForSeries,
} from "metabase/viz-core";
import type {
  Series,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

const HIDDEN_SETTING_WIDGETS = ["card.title"];

// The series cards show the color and the name of a series themselves.
const HIDDEN_SERIES_SETTING_WIDGETS = ["color", "title"];

export function useVisualizerSettingsWidgets() {
  const dispatch = useDispatch();
  const transformedSeries = useSelector(getVisualizerTransformedSeries);

  const handleChangeSettings = useCallback(
    (settings: VisualizationSettings) => {
      dispatch(updateSettings(settings));
    },
    [dispatch],
  );

  return useMemo(() => {
    if (transformedSeries.length === 0) {
      return [];
    }
    try {
      return getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        true,
      ).filter((widget) => !HIDDEN_SETTING_WIDGETS.includes(widget.id));
    } catch {
      return [];
    }
  }, [transformedSeries, handleChangeSettings]);
}

/**
 * The general settings of the chart, one tab for each settings section. The
 * settings of each series are on the series cards, not here.
 */
export function useSettingsSections(hasSeriesTab: boolean) {
  const allWidgets = useVisualizerSettingsWidgets();
  const widgets = useMemo(
    () =>
      hasSeriesTab
        ? allWidgets.filter((widget) => widget.id !== SERIES_SETTING_KEY)
        : allWidgets,
    [allWidgets, hasSeriesTab],
  );
  const { orderedSectionNames } = useChartSettingsSections({ widgets });
  // The widgets without a section go to the first section, as in
  // BaseChartSettings.
  const getSectionWidgets = useCallback(
    (section: string) =>
      widgets.filter((widget) =>
        widget.section == null
          ? section === orderedSectionNames[0]
          : String(widget.section) === section,
      ),
    [widgets, orderedSectionNames],
  );
  return { getSectionWidgets, sectionNames: orderedSectionNames };
}

export function SettingsSection({
  widgets,
  section,
}: {
  widgets: Widget[];
  section: string;
}) {
  const dispatch = useDispatch();
  const series = useSelector(getVisualizerRawSeries);
  const transformedSeries = useSelector(getVisualizerTransformedSeries);
  const settings = useSelector(getVisualizerComputedSettings);

  const handleChangeSettings = useCallback(
    (settings: VisualizationSettings) => {
      dispatch(updateSettings(settings));
    },
    [dispatch],
  );

  return (
    <BaseChartSettings
      // BaseChartSettings keeps the selected section in its state.
      key={section}
      initial={{ section }}
      series={series}
      transformedSeries={transformedSeries}
      chartSettings={settings}
      widgets={widgets}
      onChange={handleChangeSettings}
    />
  );
}

// The props that `nestedSettings` in viz-core gives to the widget of
// `series_settings`.
type SeriesSettingsWidgetProps = {
  series: Series;
  objects: SingleSeries[];
  extra: Record<string, unknown>;
  getObjectKey: (object: SingleSeries) => string;
  getSettingDefinitionsForObject: (
    series: Series,
    object: SingleSeries,
  ) => VisualizationSettingsDefinitions;
  getComputedSettingsForObject: (
    series: Series,
    object: SingleSeries,
    storedSettings: VisualizationSettings,
    extra: Record<string, unknown>,
  ) => ComputedVisualizationSettings;
};

export function useUpdateSeriesSettings() {
  const dispatch = useDispatch();
  const rawSettings = useSelector(getVisualizerRawSettings);
  return useCallback(
    (key: string, change: VisualizationSettings) => {
      const seriesSettings = rawSettings[SERIES_SETTING_KEY] ?? {};
      dispatch(
        updateSettings({
          [SERIES_SETTING_KEY]: {
            ...seriesSettings,
            [key]: { ...seriesSettings[key], ...change },
          },
        }),
      );
    },
    [dispatch, rawSettings],
  );
}

/** The settings of one series of the chart, as in the "Display" tab. */
export function SeriesSettings({ seriesKey }: { seriesKey: string }) {
  const allWidgets = useVisualizerSettingsWidgets();
  const rawSettings = useSelector(getVisualizerRawSettings);
  const updateSeriesSettings = useUpdateSeriesSettings();

  const widgets = useMemo(() => {
    const seriesWidget = allWidgets.find(
      (widget) => widget.id === SERIES_SETTING_KEY,
    );
    if (!seriesWidget?.props) {
      return [];
    }
    // See the type: these props come from `nestedSettings`.
    const props = seriesWidget.props as SeriesSettingsWidgetProps;
    const object = props.objects.find(
      (object) => props.getObjectKey(object) === seriesKey,
    );
    if (!object) {
      return [];
    }
    const storedSettings = rawSettings[SERIES_SETTING_KEY]?.[seriesKey] ?? {};
    const definitions = props.getSettingDefinitionsForObject(
      props.series,
      object,
    );
    return getSettingsWidgets(
      definitions,
      storedSettings,
      props.getComputedSettingsForObject(
        props.series,
        object,
        storedSettings,
        props.extra,
      ),
      object,
      (change) => updateSeriesSettings(seriesKey, change),
      props.extra,
    ).filter(
      (widget) =>
        !widget.hidden && !HIDDEN_SERIES_SETTING_WIDGETS.includes(widget.id),
    );
  }, [allWidgets, rawSettings, seriesKey, updateSeriesSettings]);

  return (
    <Stack gap={0}>
      {widgets.map((widget) => (
        <ChartSettingsWidget
          key={widget.id}
          {...widget}
          style={{ marginLeft: 0, marginRight: 0 }}
        />
      ))}
    </Stack>
  );
}
