import { t } from "ttag";

import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  dimensionSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, RawSeries } from "metabase-types/api";

import { findSensibleRadarColumns } from "./utils/data";

const MAX_RADAR_INDICATORS = 30;

export const SETTINGS_DEFINITIONS = {
  ...columnSettings({ hidden: true }),
  ...dimensionSetting("radar.dimension", {
    section: t`Data`,
    title: t`Dimension`,
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([series]: RawSeries) =>
      findSensibleRadarColumns(series.data)?.dimension,
  }),
  ...metricSetting("radar.metrics", {
    section: t`Data`,
    title: t`Metrics`,
    widget: "multi-select",
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([series]: RawSeries) =>
      findSensibleRadarColumns(series.data)?.metrics,
    getOptions: ([
      {
        data: { cols },
      },
    ]: RawSeries) => {
      return cols
        .filter(isMetric)
        .map((col) => ({ name: col.display_name, value: col.name }));
    },
  }),
  "radar.show_area": {
    section: t`Display`,
    title: t`Show area`,
    widget: "toggle",
    default: true,
    inline: true,
  },
  "radar.show_values": {
    section: t`Display`,
    title: t`Show values`,
    widget: "toggle",
    default: true,
    inline: true,
  },
  "radar.shape": {
    section: t`Display`,
    title: t`Shape`,
    widget: "segmentedControl",
    default: "polygon",
    props: {
      options: [
        { name: t`Polygon`, value: "polygon" },
        { name: t`Circle`, value: "circle" },
      ],
    },
  },
  "radar.scale_type": {
    section: t`Display`,
    title: t`Scale`,
    widget: "segmentedControl",
    default: "auto",
    props: {
      options: [
        { name: t`Auto`, value: "auto" },
        { name: t`Linear`, value: "linear" },
        { name: t`Log`, value: "log" },
      ],
    },
  },
};

export const RADAR_CHART_DEFINITION = {
  getUiName: () => t`Radar`,
  identifier: "radar",
  iconName: "radar",
  noun: t`radar chart`,
  minSize: getMinSize("radar"),
  defaultSize: getDefaultSize("radar"),
  isSensible: (data: DatasetData) => {
    const { cols, rows } = data;
    const numDimensions = cols.filter(isDimension).length;
    const numMetrics = cols.filter(isMetric).length;

    const hasEnoughRows = rows.length >= 3;
    const hasSuitableColumnTypes = numDimensions >= 1 && numMetrics >= 2;

    if (!hasSuitableColumnTypes || !hasEnoughRows) {
      return false;
    }

    const suitableColumns = findSensibleRadarColumns(data);
    return suitableColumns !== null;
  },
  checkRenderable: (
    rawSeries: RawSeries,
    settings: ComputedVisualizationSettings,
  ) => {
    const { rows, cols } = rawSeries[0].data;

    if (rows.length === 0) {
      return;
    }

    const dimensionColumn = cols.find(
      (col) => col.name === settings["radar.dimension"],
    );
    const metricsColumns = cols.filter(
      (col) =>
        settings["radar.metrics"]?.includes(col.name) && isMetric(col),
    );

    if (!dimensionColumn) {
      throw new ChartSettingsError(t`Please select a dimension`, {
        section: `Data`,
      });
    }

    if (!metricsColumns || metricsColumns.length < 2) {
      throw new ChartSettingsError(
        t`Please select at least two metrics to compare`,
        { section: "Data" },
      );
    }

    const dimensionIndex = cols.findIndex(
      (col) => col.name === settings["radar.dimension"],
    );
    const uniqueValues = new Set(rows.map((row) => row[dimensionIndex]));

    if (uniqueValues.size > MAX_RADAR_INDICATORS) {
      throw new ChartSettingsError(
        t`Radar chart doesn't support more than ${MAX_RADAR_INDICATORS} indicators.`,
      );
    }

    if (uniqueValues.size < 3) {
      throw new ChartSettingsError(
        t`Radar chart requires at least 3 data points to form a meaningful shape.`,
      );
    }
  },
  hasEmptyState: true,
  settings: {
    ...SETTINGS_DEFINITIONS,
  } as any as VisualizationSettingsDefinitions,
};