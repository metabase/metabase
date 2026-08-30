import { c, t } from "ttag";

import {
  ChartSettingsError,
  type VisualizationDefinition,
  type VisualizationSettingsDefinitions,
  columnSettings,
  fieldSetting,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";
import { isDate, isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, DatasetData } from "metabase-types/api";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

import { MAX_COMPARISONS, VIZ_SETTINGS_DEFAULTS } from "./constants";
import {
  getColumnsForComparison,
  getComparisonOptions,
  getComparisons,
  getDefaultComparison,
  isSuitableScalarColumn,
  validateComparisons,
} from "./utils";

export const SETTINGS_DEFINITIONS: VisualizationSettingsDefinitions = {
  ...fieldSetting("scalar.field", {
    getSection: () => t`Data`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Primary number`,
    fieldFilter: isSuitableScalarColumn,
  }),
  "scalar.comparisons": {
    getSection: () => t`Data`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Comparisons`,
    widget: "smartScalarComparison",
    getValue: (series, vizSettings) => getComparisons(series, vizSettings),
    isValid: (series, vizSettings) => validateComparisons(series, vizSettings),
    getDefault: (series, vizSettings) =>
      getDefaultComparison(series, vizSettings),
    getProps: (series, vizSettings) => {
      const cols = series[0].data.cols;
      return {
        maxComparisons: MAX_COMPARISONS,
        comparableColumns: getColumnsForComparison(cols, vizSettings),
        options: getComparisonOptions(series, vizSettings),
        series,
        settings: vizSettings,
      };
    },
    readDependencies: ["scalar.field"],
  },
  "scalar.switch_positive_negative": {
    getSection: () => t`Display`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Switch positive / negative colors?`,
    widget: "toggle",
    inline: true,
    getDefault: () => VIZ_SETTINGS_DEFAULTS["scalar.switch_positive_negative"],
  },
  "scalar.compact_primary_number": {
    getSection: () => t`Display`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    title: t`Compact number`,
    widget: "toggle",
    inline: true,
    getDefault: () => VIZ_SETTINGS_DEFAULTS["scalar.compact_primary_number"],
  },
  ...columnSettings({
    getSection: () => t`Display`,
    getColumns: (
      [
        {
          data: { cols },
        },
      ],
      settings,
    ) => {
      const metricColumn =
        // try and find a selected field setting
        cols.find((col) => col.name === settings["scalar.field"]) ||
        // fall back to the second column
        cols[1] ||
        // but if there's only one column use that
        cols[0];
      // expose the date dimension so its granularity/format can be configured
      const dateColumn = cols.find(
        (col) => isDate(col) || isAbsoluteDateTimeUnit(col.unit),
      );
      const columns = [metricColumn, dateColumn].filter(
        (col): col is DatasetColumn => col != null,
      );
      return columns.filter((col, index) => columns.indexOf(col) === index);
    },
    readDependencies: ["scalar.field"],
  }),
  click_behavior: {},
};

export const SMART_SCALAR_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Trend`,
  identifier: "smartscalar",
  iconName: "smartscalar",
  canSavePng: true,

  minSize: getMinSize("smartscalar"),
  defaultSize: getDefaultSize("smartscalar"),

  settings: SETTINGS_DEFINITIONS,

  columnSettings: (column) => {
    const isDateColumn = isDate(column) || isAbsoluteDateTimeUnit(column.unit);
    if (!isDateColumn) {
      return {};
    }
    return {
      date_granularity: {
        title: t`Date granularity`,
        widget: "select",
        getDefault: () => "default",
        getProps: () => ({
          options: [
            { name: t`Full date`, value: "default" },
            {
              name: c(
                "Date granularity option, distinct from the pluralized unit",
              ).t`Year`,
              value: "year",
            },
            { name: t`Quarter and year`, value: "quarter" },
            { name: t`Month and year`, value: "month" },
          ],
        }),
      },
    };
  },

  isSensible({ rows, cols }: DatasetData) {
    const dimensionCount = cols.filter(
      (col) => isDimension(col) && !isMetric(col),
    ).length;
    const dateCount = cols.filter(
      (col) => isDate(col) || isAbsoluteDateTimeUnit(col.unit),
    ).length;
    const metricCount = cols.filter((col) => isMetric(col)).length;
    return (
      rows.length >= 1 &&
      dimensionCount === 1 &&
      dateCount === 1 &&
      metricCount >= 1
    );
  },

  // Smart scalars need to have a breakout
  checkRenderable(
    [
      {
        data: { cols },
      },
    ],
    settings,
  ) {
    const dateCount = cols.filter(
      (col) => isDate(col) || isAbsoluteDateTimeUnit(col.unit),
    ).length;
    if (dateCount === 0) {
      throw new ChartSettingsError(
        t`Group only by a time field to see how this has changed over time`,
      );
    }

    const metricCount = cols.filter(
      (col) => col.name === settings["scalar.field"],
    ).length;
    if (metricCount === 0) {
      throw new ChartSettingsError(
        t`Add a metric to see how it's changed over time`,
      );
    }
  },

  hasEmptyState: true,
};
