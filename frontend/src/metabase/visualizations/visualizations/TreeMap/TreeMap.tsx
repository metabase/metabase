import { t } from "ttag";

import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultDimensions,
  getDefaultMetrics,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import type {
  type ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { RawSeries } from "metabase-types/api";

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

function getTreeMapModel(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) {
  const [
    {
      data: { rows: rows, cols: cols },
    },
  ] = rawSeries;

  const dimensions = settings[__DIMENSIONS];
  const measure = settings[__MEASURES];

  const dimIndexes = cols
    .map((value, index) => [value.name, index] as const)
    .filter(value => dimensions.includes(value[0]))
    .map(value => value[1]);

  const [measIndex] = cols
    .map((value, index) => [value.name, index] as const)
    .filter(value => value[0] === measure)
    .map(value => value[1]);

  const onlyNeededCols = rows.map(value =>
    dimIndexes.map(v => value[v]).concat([value[measIndex]]),
  );

  return onlyNeededCols.map(value => {
    return {
      name: value[0],
      value: value[value.length - 1],
    };
  });
}

export function TreeMap(props: VisualizationProps) {
  const { rawSeries, settings } = props;

  const data = getTreeMapModel(rawSeries, settings);

  const option = {
    series: [
      {
        type: "treemap",
        nodeClick: false,
        breadcrumb: {
          show: false,
        },
        data,
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
