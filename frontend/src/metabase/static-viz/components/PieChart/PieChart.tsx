import type { StaticChartProps } from "../StaticVisualization";

export function PieChart(props: StaticChartProps) {
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
