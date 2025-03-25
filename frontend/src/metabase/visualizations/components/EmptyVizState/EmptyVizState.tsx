import type { VisualizationDefinition } from "metabase/visualizations/types";

interface EmptyVizStateProps {
  visualization: VisualizationDefinition;
}

export const EmptyVizState = ({ visualization }: EmptyVizStateProps) => {
  return <h1>Hello from the {visualization.uiName} chart</h1>;
};
