import type { IsomorphicStaticChartProps } from "metabase/static-viz/containers/IsomorphicStaticChart/types";

const Placeholder = ({ text }: { text: string }) => {
  return (
    <svg width="300" height="40">
      <text x="20px" y="20px">
        {text}
      </text>
    </svg>
  );
};

export const IsomorphicStaticChart = (props: IsomorphicStaticChartProps) => {
  const display = props.rawSeries[0].card.display;

  switch (display) {
    case "line":
    case "area":
    case "bar":
    case "combo":
      return <Placeholder text="line/area/bar placeholder" />;
    case "scalar":
      return <Placeholder text="combined scalar placeholder" />;
    case "pie":
      return <Placeholder text="pie placeholder" />;
  }

  throw new Error(`Unsupported display type: ${display}`);
};
