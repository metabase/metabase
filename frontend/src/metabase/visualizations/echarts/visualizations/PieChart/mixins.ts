import { useState } from "react";

import type { EChartsMixin } from "metabase/visualizations/types";

export const pieSeriesMixin: EChartsMixin = ({ option, props }) => {
  option.series = {
    type: "sunburst",
    radius: ["60%", "90%"], // TODO calculate this like we do in PieChart.jsx
    data: props.data.rows.map(r => ({
      // TODO fix type error
      value: r[props.settings["pie._metricIndex"]] ?? undefined,
      name: r[props.settings["pie._dimensionIndex"]] ?? undefined,
    })),
  };

  return { option };
};

// Will later use this changing total on hover
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
