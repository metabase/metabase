import { useState } from "react";
import type { SunburstSeriesOption } from "echarts";

import type { EChartsMixin } from "metabase/visualizations/types";
import {
  computeLabelDecimals,
  formatPercent,
} from "metabase/visualizations/visualizations/PieChart/utils";
import { getSlices } from "./utils";

export const pieSeriesMixin: EChartsMixin = ({ option, props }) => {
  const slices = getSlices({ props });

  option.series = {
    type: "sunburst",
    radius: ["60%", "90%"], // TODO calculate this like we do in PieChart.jsx
    sort: undefined,
    data: slices.map(s => ({
      // TODO fix type error
      value: s.value,
      name: s.key,
      itemStyle: {
        color: s.color,
      },
    })),
  };

  return { option };
};

export const showPercentagesOnChartMixin: EChartsMixin = ({
  option,
  props,
}) => {
  if (props.settings["pie.percent_visibility"] !== "inside") {
    return { option };
  }
  const slices = getSlices({ props });
  const percentages = slices.map(s => s.percentage);
  const labelDecimals = computeLabelDecimals({ percentages });

  (option.series as SunburstSeriesOption).data?.forEach((d, index) => {
    d.label = {
      ...d.label,
      formatter: () =>
        formatPercent({
          percent: percentages[index],
          decimals: labelDecimals ?? 0,
          settings: props.settings,
          cols: props.data.cols,
        }),
    };
  });

  return { option };
};

// Will later use this for changing total on hover
export function usePieTotalMixin() {
  const [text, setText] = useState("");

  const pieTotalMixin: EChartsMixin = ({ option }) => {
    // TODO fix any type
    const mouseoverHandler = (event: any) => {
      setText(`${event.data.name} - ${event.data.value}`);
    };
    const mouseoutHandler = (event: any) => {
      setText("Total...");
    };

    option.graphic = {
      type: "text",
      left: "center",
      top: "center",
      // TODO styles
      style: {
        fill: "#000",
        font: "bold 26px sans-serif",
        text: text || "Total...",
      },
    };
    option.hoverLayerThreshold = 0;

    return {
      option,
      eventHandlers: [
        {
          eventName: "mouseover",
          query: "series.sunburst",
          handler: mouseoverHandler,
        },
        { eventName: "mouseout", handler: mouseoutHandler },
      ],
    };
  };

  return pieTotalMixin;
}
