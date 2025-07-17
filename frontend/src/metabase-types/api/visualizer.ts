import type {
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

export type VisualizerDataSourceType = "card";
export type VisualizerDataSourceId = `${VisualizerDataSourceType}:${number}`;

export type VisualizerDataSource = {
  id: VisualizerDataSourceId;
  sourceId: number;
  type: VisualizerDataSourceType;
  name: string;
};

export type VisualizerColumnReference = {
  sourceId: VisualizerDataSourceId;
  name: string; // in combined dataset
  originalName: string; // in original dataset
};
// a way to use dataset's name as a value

export type VisualizerDataSourceNameReference =
  `$_${VisualizerDataSourceId}_name`;

export type VisualizerColumnValueSource =
  | VisualizerColumnReference
  | VisualizerDataSourceNameReference;

export type VisualizerVizDefinition = {
  display: VisualizationDisplay | null;
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>;
  settings: VisualizationSettings;
};

export type Widget = {
  id: string;
  section?: string;
  props: Record<string, unknown>;
};
