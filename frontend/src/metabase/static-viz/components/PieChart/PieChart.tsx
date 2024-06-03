import type { StaticChartProps } from "../StaticVisualization";

import { computeStaticPieChartSettings } from "./settings";

export function PieChart({ rawSeries, dashcardSettings }: StaticChartProps) {
  const computedVizSettings = computeStaticPieChartSettings(
    rawSeries,
    dashcardSettings,
  );
  console.log("computedVizSettings", computedVizSettings);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={500} height={500}>
      <text
        id="outer-text"
        fill="black"
        dominantBaseline="central"
        transform="translate(50 50)"
      >
        Placeholder
      </text>
    </svg>
  );
}
