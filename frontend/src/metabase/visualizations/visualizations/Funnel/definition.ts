import { t } from "ttag";
import _ from "underscore";

import { formatNullable } from "metabase/formatting";
import {
  ChartSettingsError,
  MinRowsError,
} from "metabase/visualizations/lib/errors";
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
  VisualizationDefinition,
} from "metabase/visualizations/types";
import {
  type DatasetData,
  type RawSeries,
  type RowValue,
  getRowsForStableKeys,
} from "metabase-types/api";

import type { FunnelRow } from "./types";

const getUniqueFunnelRows = (rows: FunnelRow[]) => {
  return [...new Map(rows.map((row) => [row.key, row])).values()];
};

export const FUNNEL_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Funnel`,
  identifier: "funnel",
  iconName: "funnel",
  noHeader: true,
  minSize: getMinSize("funnel"),
  supportsVisualizer: true,
  defaultSize: getDefaultSize("funnel"),
  isSensible({ cols }: DatasetData) {
    return cols.length === 2;
  },
  checkRenderable: (
    series: RawSeries,
    settings: ComputedVisualizationSettings,
  ) => {
    const [
      {
        data: { rows },
      },
    ] = series;
    if (series.length > 1) {
      return;
    }

    if (rows.length < 1) {
      throw new MinRowsError(rows.length);
    }
    if (!settings["funnel.dimension"] || !settings["funnel.metric"]) {
      throw new ChartSettingsError(
        t`Which fields do you want to use?`,
        { section: t`Data` },
        t`Choose fields`,
      );
    }
  },

  hasEmptyState: true,

  settings: {
    ...columnSettings({ getHidden: () => true }),
    ...dimensionSetting("funnel.dimension", {
      getSection: () => t`Data`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#5504
      title: t`Column with steps`,
      dashboard: false,
      useRawSeries: true,
      showColumnSetting: true,
      getWrapperStyle: () => ({
        marginBottom: "0.625rem",
      }),
    }),
    "funnel.order_dimension": {
      getValue: (_series: RawSeries, settings: ComputedVisualizationSettings) =>
        settings["funnel.dimension"],
      readDependencies: ["funnel.rows"],
    },
    "funnel.rows": {
      getSection: () => t`Data`,
      widget: "orderedSimple",
      getValue: (
        rawSeries: RawSeries,
        settings: ComputedVisualizationSettings,
      ) => {
        const { cols } = rawSeries[0].data;
        const dimensionIndex = cols.findIndex(
          (col) => col.name === settings["funnel.dimension"],
        );
        const orderDimension = settings["funnel.order_dimension"];
        const dimension = settings["funnel.dimension"];

        const rowsOrder = settings["funnel.rows"];
        const rowsForKeys = getRowsForStableKeys(rawSeries[0].data);
        const rowsKeys = rowsForKeys.map((row) =>
          formatNullable(row[dimensionIndex]),
        );

        const getDefault = (keys: RowValue[]) =>
          keys.map((key) => ({
            key,
            name: key,
            enabled: true,
          }));
        if (
          !rowsOrder ||
          !_.isArray(rowsOrder) ||
          !rowsOrder.every((setting) => setting.key !== undefined) ||
          orderDimension !== dimension
        ) {
          return getUniqueFunnelRows(getDefault(rowsKeys));
        }

        const removeMissingOrder = (keys: RowValue[], order: any) =>
          order.filter((o: any) => keys.includes(o.key));
        const newKeys = (keys: RowValue[], order: any) =>
          keys.filter((key) => !order.find((o: any) => o.key === key));

        const funnelRows = [
          ...removeMissingOrder(rowsKeys, rowsOrder),
          ...getDefault(newKeys(rowsKeys, rowsOrder)),
        ];

        return getUniqueFunnelRows(funnelRows);
      },
      getProps: () => ({
        hasEditSettings: false,
      }),
      getHidden: (series: RawSeries, settings: ComputedVisualizationSettings) =>
        settings["funnel.dimension"] === null ||
        settings["funnel.metric"] === null,
      writeDependencies: ["funnel.order_dimension"],
      dataTestId: "funnel-row-sort",
    },
    ...metricSetting("funnel.metric", {
      getSection: () => t`Data`,

      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#5504
      title: t`Measure`,

      dashboard: false,
      useRawSeries: true,
      showColumnSetting: true,
    }),
    "funnel.type": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#5504
      title: t`Funnel type`,

      getSection: () => t`Display`,

      widget: "select",
      getProps: () => ({
        options: [
          { name: t`Funnel`, value: "funnel" },
          { name: t`Bar chart`, value: "bar" },
        ],
      }),
      // legacy "bar" funnel was only previously available via multiseries
      getDefault: (series: RawSeries) => (series.length > 1 ? "bar" : "funnel"),
      useRawSeries: true,
    },
  },
};
