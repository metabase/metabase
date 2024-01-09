import type { StaticVisualizationProps } from "metabase/visualizations/types";

const Placeholder = ({ text }: { text: string }) => {
  return <div style={{ width: "300px", height: "200px" }}>{text}</div>;
};

export const StaticVisualization = (props: StaticVisualizationProps) => {
  const display = props.rawSeries[0].card.display;

  switch (display) {
    case "smartscalar":
      return <Placeholder text="trend chart placeholder" />;
  }

  throw new Error(`Unsupported display type: ${display}`);
};
