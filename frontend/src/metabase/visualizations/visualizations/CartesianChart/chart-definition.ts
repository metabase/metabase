import _ from "underscore";
import { t } from "ttag";
import type { Visualization } from "metabase/visualizations/types";
import {
  validateChartDataSettings,
  validateDatasetRows,
  validateStacking,
} from "metabase/visualizations/lib/settings/validation";
import type { RawSeries } from "metabase-types/api";
import LineAreaBarChart from "metabase/visualizations/components/LineAreaBarChart";
import { isDimension, isMetric } from "metabase-lib/types/utils/isa";

export const getCartesianChartDefinition = (
  props: Partial<Visualization>,
): Partial<Visualization> => {
  return {
    noHeader: true,
    supportsSeries: true,

    isSensible: ({ cols, rows }) => {
      return (
        rows.length > 1 &&
        cols.length >= 2 &&
        cols.filter(isDimension).length > 0 &&
        cols.filter(isMetric).length > 0
      );
    },

    isLiveResizable: series => {
      const totalRows = series.reduce((sum, s) => sum + s.data.rows.length, 0);
      return totalRows < 10;
    },

    checkRenderable(series, settings) {
      if (series.length > (this.maxMetricsSupported ?? Infinity)) {
        throw new Error(
          t`${this.uiName} chart does not support multiple series`,
        );
      }

      validateDatasetRows(series);
      validateChartDataSettings(settings);
      validateStacking(settings);
    },

    placeholderSeries: [
      {
        card: {
          display: props.identifier,
          visualization_settings: {
            "graph.metrics": ["x"],
            "graph.dimensions": ["y"],
          },
          dataset_query: { type: "query" },
          name: "x",
        },
        data: {
          rows: _.range(0, 11).map(i => [i, i]),
          cols: [
            { name: "x", base_type: "type/Integer" },
            { name: "y", base_type: "type/Integer" },
          ],
        },
      },
    ] as RawSeries,

    transformSeries: LineAreaBarChart.transformSeries,

    ...props,
  };
};
