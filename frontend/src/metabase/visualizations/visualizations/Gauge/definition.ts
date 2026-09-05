import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { color as colorHex } from "metabase/ui/colors";
import {
  hasFailedGoalReferences,
  resolveGoalSegments,
} from "metabase/visualizations/lib/dynamic-goals";
import {
  type VisualizationDefinition,
  columnSettings,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";

import { DEFAULT_GAUGE_RANGE } from "./constants";
import { getSegmentsRange } from "./utils";

export const GAUGE_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Gauge`,
  identifier: "gauge",
  iconName: "gauge",
  minSize: getMinSize("gauge"),
  defaultSize: getDefaultSize("gauge"),
  isSensible: ({ cols, rows }) => {
    return rows.length === 1 && cols.length === 1;
  },
  checkRenderable: ([{ data }], settings) => {
    if (!isNumeric(data.cols[0]) || isDate(data.cols[0])) {
      throw new Error(t`Gauge visualization requires a number.`);
    }

    if (hasFailedGoalReferences(data, settings["gauge.segments"])) {
      throw new Error(
        t`Couldn't load a value one of this gauge's ranges depends on.`,
      );
    }
  },
  settings: {
    ...columnSettings({
      getColumns: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => [
        _.find(cols, (col) => col.name === settings["scalar.field"]) || cols[0],
      ],
    }),
    "gauge.range": {
      // currently not exposed in settings, just computed from gauge.segments
      getDefault(series, vizSettings) {
        const segments = resolveGoalSegments(
          series[0].data,
          vizSettings["gauge.segments"],
        );
        return getSegmentsRange(segments) ?? DEFAULT_GAUGE_RANGE;
      },
      readDependencies: ["gauge.segments"],
    },
    "gauge.segments": {
      getSection: () => t`Ranges`,
      getDefault(series) {
        let value = 100;
        try {
          const defaultValue = series[0].data.rows[0][0] || 0;

          if (typeof defaultValue === "number") {
            value = defaultValue;
          }
        } catch (error) {}
        const errorColor = Color(colorHex("error")).hex();
        const warningColor = Color(colorHex("warning")).hex();
        const successColor = Color(colorHex("success")).hex();
        return [
          { min: 0, max: value / 2, color: errorColor, label: "" },
          { min: value / 2, max: value, color: warningColor, label: "" },
          { min: value, max: value * 2, color: successColor, label: "" },
        ];
      },
      widget: "segmentsEditor",
      persistDefault: true,
      getProps: ([{ card, data }]) => ({
        data,
        datasetQuery: card.dataset_query,
      }),
      getWrapperStyle: () => ({
        marginLeft: 0,
        marginRight: 0,
      }),
    },
  },
};
