import type { VisualizationDisplay } from "metabase-types/api";

export type ChartTypeGroup = {
  label: string;
  testId: string;
  items: VisualizationDisplay[];
};
