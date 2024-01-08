import type { RawSeries, VisualizationSettings } from "metabase-types/api";

const Placeholder = ({ text }: { text: string }) => {
  return <div style={{ width: "300px", height: "200px" }}>{text}</div>;
};

export interface StaticChartProps {
  rawSeries: RawSeries;
  dashcardSettings: VisualizationSettings;
  renderingContext: RenderingContext;
}

export const StaticChart = (props: StaticChartProps) => {
  const display = props.rawSeries[0].card.display;

  switch (display) {
    case "smartscalar":
      return <Placeholder text="trend chart placeholder" />;
  }

  throw new Error(`Unsupported display type: ${display}`);
};
