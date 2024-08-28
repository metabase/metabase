import * as echarts from "echarts";
import { t } from "ttag";
import _ from "underscore";

import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import type { VisualizationProps } from "metabase/visualizations/types";

export const Heatmap = (_props: VisualizationProps) => {
  function getVirtualData(year: string) {
    const date = +echarts.time.parse(year + "-01-01");
    const end = +echarts.time.parse(+year + 1 + "-01-01");
    const dayTime = 3600 * 24 * 1000;
    const data = [];
    for (let time = date; time < end; time += dayTime) {
      data.push([
        echarts.time.format(time, "{yyyy}-{MM}-{dd}", false),
        Math.floor(Math.random() * 10000),
      ]);
    }
    return data;
  }
  const option = {
    title: {
      top: 30,
      left: "center",
      text: "Daily Step Count",
    },
    tooltip: {},
    visualMap: {
      min: 0,
      max: 10000,
      type: "piecewise",
      orient: "horizontal",
      left: "center",
      top: 65,
    },
    calendar: {
      top: 120,
      left: 30,
      right: 30,
      cellSize: ["auto", 13],
      range: "2016",
      itemStyle: {
        borderWidth: 0.5,
      },
      yearLabel: { show: false },
    },
    series: {
      type: "heatmap",
      coordinateSystem: "calendar",
      data: getVirtualData("2016"),
    },
  };

  return <ResponsiveEChartsRenderer option={option} />;
};

Object.assign(Heatmap, {
  uiName: t`Heatmap`,
  identifier: "Heatmap",
  iconName: "grid",
  noun: t`Heatmap`,
});
