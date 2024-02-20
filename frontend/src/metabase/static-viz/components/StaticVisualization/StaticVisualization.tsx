import type { StaticVisualizationProps } from "metabase/visualizations/types";

import { SmartScalar } from "../SmartScalar";

const Placeholder = ({ text }: { text: string }) => {
  return <div style={{ width: "300px", height: "200px" }}>{text}</div>;
};

export const StaticVisualization = (props: StaticVisualizationProps) => {
  const display = props.rawSeries[0].card.display;

  switch (display) {
    case "scalar":
      return <Placeholder text="Scalar" />;
    case "smartscalar":
      return <SmartScalar {...props} />;
  }

  throw new Error(`Unsupported display type: ${display}`);
};
