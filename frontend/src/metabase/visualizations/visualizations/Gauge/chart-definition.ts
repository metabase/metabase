import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { color as colorHex } from "metabase/lib/colors";
import { ChartSettingSegmentsEditor } from "metabase/visualizations/components/settings/ChartSettingSegmentsEditor";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { segmentIsValid } from "metabase/visualizations/lib/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  VisualizationDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";

import { isGaugeSegmentsArray } from "./types";

export const GAUGE_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Gauge`,
  identifier: "gauge",
  iconName: "gauge",
  minSize: getMinSize("gauge"),
  defaultSize: getDefaultSize("gauge"),
  isSensible: ({ cols, rows }) => {
    return rows.length === 1 && cols.length === 1;
  },
  checkRenderable: ([
    {
      data: { cols },
    },
  ]) => {
    if (!isNumeric(cols[0]) || isDate(cols[0])) {
      throw new Error(t`Gauge visualization requires a number.`);
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
        const gaugeSegments = vizSettings["gauge.segments"];
        const segments = isGaugeSegmentsArray(gaugeSegments)
          ? gaugeSegments.filter((segment) => segmentIsValid(segment))
          : [];
        const values = [
          ...segments.map((segment) => segment.max),
          ...segments.map((segment) => segment.min),
        ];
        return values.length > 0
          ? [Math.min(...values), Math.max(...values)]
          : [0, 1];
      },
      readDependencies: ["gauge.segments"],
    },
    "gauge.segments": {
      get section() {
        return t`Ranges`;
      },
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
      widget: ChartSettingSegmentsEditor,
      persistDefault: true,
      noPadding: true,
    },
  } as VisualizationSettingsDefinitions,
};
