import { t } from "ttag";

import type { VisualizationProps } from "metabase/visualizations/types";

import { ChartRenderer } from "./TreeMap.styled";

Object.assign(TreeMap, {
  uiName: t`Treemap`,
  identifier: "treemap",
  iconName: "ai",
  placeholderSeries: [],
  settings: {},
});

export function TreeMap(_props: VisualizationProps) {
  const option = {
    series: [
      {
        type: "treemap",
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
