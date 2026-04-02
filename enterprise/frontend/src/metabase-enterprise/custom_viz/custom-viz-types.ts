import type { Visualization } from "metabase/visualizations/types/visualization";

export type CustomVizPluginDefinition = {
  VisualizationComponent: Visualization;
  minSize?: Visualization["minSize"];
  defaultSize?: Visualization["defaultSize"];
  checkRenderable?: Visualization["checkRenderable"];
  settings?: Visualization["settings"];
};
