import { useMemo } from "react";
import { t } from "ttag";

import { color } from "metabase/ui/colors";
import { ChartRenderingErrorBoundary } from "metabase/visualizations/components/ChartRenderingErrorBoundary";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { DatasetData, RawSeries } from "metabase-types/api";

const REQUIRED_FIELDS = [
  "whisker.min",
  "whisker.lower",
  "whisker.median",
  "whisker.upper",
  "whisker.max",
] as const;

function colIndex(data: DatasetData, colName: string | undefined): number {
  if (!colName) {
    return -1;
  }
  return data.cols.findIndex((c) => c.name === colName);
}

function BoxWhiskerInner({ rawSeries, settings }: VisualizationProps) {
  const [{ data }] = rawSeries;

  const dimIdx = colIndex(data, settings["whisker.dimension"]);
  const minIdx = colIndex(data, settings["whisker.min"]);
  const lowerIdx = colIndex(data, settings["whisker.lower"]);
  const medianIdx = colIndex(data, settings["whisker.median"]);
  const upperIdx = colIndex(data, settings["whisker.upper"]);
  const maxIdx = colIndex(data, settings["whisker.max"]);

  const option = useMemo(() => {
    const hasDimension = dimIdx >= 0;
    const categories: string[] = hasDimension
      ? data.rows.map((row) => String(row[dimIdx]))
      : [""];

    const boxData = data.rows.map((row) => [
      row[minIdx],
      row[lowerIdx],
      row[medianIdx],
      row[upperIdx],
      row[maxIdx],
    ]);

    const brandColor = color("brand");

    return {
      grid: { left: 60, right: 20, top: 20, bottom: 40, containLabel: true },
      xAxis: {
        type: "category" as const,
        data: categories,
        boundaryGap: true,
        axisLabel: { color: color("text-secondary") },
        axisLine: { lineStyle: { color: color("border") } },
      },
      yAxis: {
        type: "value" as const,
        axisLabel: { color: color("text-secondary") },
        axisLine: { lineStyle: { color: color("border") } },
        splitLine: { lineStyle: { color: color("border") } },
      },
      series: [
        {
          name: t`Box and Whisker`,
          type: "boxplot" as const,
          data: boxData,
          itemStyle: {
            color: `${brandColor}33`,
            borderColor: brandColor,
            borderWidth: 2,
          },
          emphasis: {
            itemStyle: {
              color: `${brandColor}55`,
              borderColor: brandColor,
            },
          },
        },
      ],
      tooltip: {
        trigger: "item" as const,
        formatter: (params: { name: string; data: number[] }) => {
          const [min, lower, median, upper, max] = params.data;
          const label = params.name ? `<b>${params.name}</b><br/>` : "";
          return (
            label +
            `${t`Max`}: ${max}<br/>` +
            `${t`Upper`}: ${upper}<br/>` +
            `${t`Median`}: ${median}<br/>` +
            `${t`Lower`}: ${lower}<br/>` +
            `${t`Min`}: ${min}`
          );
        },
      },
    };
  }, [data, dimIdx, minIdx, lowerIdx, medianIdx, upperIdx, maxIdx]);

  return <ResponsiveEChartsRenderer option={option} />;
}

export function BoxWhisker(props: VisualizationProps) {
  return (
    <ChartRenderingErrorBoundary onRenderError={props.onRenderError}>
      <BoxWhiskerInner {...props} />
    </ChartRenderingErrorBoundary>
  );
}

const fieldPickerDef = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  section: t`Data`,
  useRawSeries: true,
  dashboard: false,
  getDefault: () => undefined,
};

const BOX_WHISKER_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Box and Whisker`,
  identifier: "whisker",
  iconName: "boxplot",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`box and whisker chart`,
  minSize: getMinSize("waterfall"),
  defaultSize: getDefaultSize("waterfall"),
  hasEmptyState: true,

  isSensible({ cols, rows }: DatasetData) {
    return cols.length >= 5 && rows.length >= 1;
  },

  checkRenderable(series: RawSeries, settings: ComputedVisualizationSettings) {
    const missing = REQUIRED_FIELDS.some((f) => !settings[f]);
    if (missing) {
      throw new ChartSettingsError(
        t`Which fields do you want to use?`,
        { section: t`Data` },
        t`Choose fields`,
      );
    }

    const hasDimension = Boolean(settings["whisker.dimension"]);
    const [{ data }] = series;
    if (!hasDimension && data.rows.length > 1) {
      throw new ChartSettingsError(
        t`Multiple rows require a Dimension field to be set.`,
        { section: t`Data` },
        t`Choose fields`,
      );
    }
  },

  settings: {
    ...columnSettings({ hidden: true }),
    ...fieldSetting("whisker.dimension", {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Dimension (optional)`,
      ...fieldPickerDef,
    }),
    ...fieldSetting("whisker.min", {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Min`,
      ...fieldPickerDef,
    }),
    ...fieldSetting("whisker.lower", {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Lower`,
      ...fieldPickerDef,
    }),
    ...fieldSetting("whisker.median", {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Median`,
      ...fieldPickerDef,
    }),
    ...fieldSetting("whisker.upper", {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Upper`,
      ...fieldPickerDef,
    }),
    ...fieldSetting("whisker.max", {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Max`,
      ...fieldPickerDef,
    }),
  },
};

Object.assign(BoxWhisker, BOX_WHISKER_DEFINITION);
