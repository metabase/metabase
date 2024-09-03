import { t } from "ttag";

import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultDimensions,
  getDefaultMetrics,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import type { VisualizationProps } from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";

import { ChartRenderer } from "./TreeMap.styled";

const __DIMENSIONS = "treemap.dimensions";
const __MEASURES = "treemap.measures";

Object.assign(TreeMap, {
  uiName: t`Treemap`,
  identifier: "treemap",
  iconName: "ai",
  placeholderSeries: [],
  settings: {
    [__DIMENSIONS]: {
      section: t`Columns`,
      title: t`Dimensions`,
      widget: "fields",
      getDefault: (series, vizSettings) =>
        getDefaultDimensions(series, vizSettings),
      getProps: ([{ _card, data }], vizSettings) => {
        const addedDimensions = vizSettings[__DIMENSIONS] || [];
        const options = data.cols.filter(isDimension).map(getOptionFromColumn);
        return {
          options,
          addAnother:
            options.length > addedDimensions.length
              ? t`Add series breakout`
              : null,
          columns: data.cols,
        };
      },
    },
    [__MEASURES]: {
      section: t`Columns`,
      title: t`Measures`,
      widget: "field",
      getDefault: (series, vizSettings) =>
        getDefaultMetrics(series, vizSettings),
      getProps: ([{ _card, data }], _vizSettings) => {
        const options = data.cols.filter(isMetric).map(getOptionFromColumn);
        return {
          options,
        };
      },
    },
  },
});

export function TreeMap(_props: VisualizationProps) {
  const option = {
    series: [
      {
        type: "treemap",
        nodeClick: false,
        breadcrumb: {
          show: false,
        },
        data: [
          {
            name: "nodeA",
            value: 5,
          },
        ],
      },
    ],
  };
  return (
    <ChartRenderer
      option={option}
      width={"auto"}
      height={"auto"}
      onResize={(_width: number, _height: number) => undefined}
      notMerge={false}
      style={null}
    />
  );
}
