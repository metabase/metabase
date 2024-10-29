import type {
  Card,
  Dataset,
  DatasetColumn,
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

export type VisualizerColumnImport = {
  sourceId: VisualizerDataSourceId;
  columnKey: string;
  name: string;
};

export type VisualizerDatasetColumn = DatasetColumn & {
  values: string[];
  source: "artificial";
};

type BaseDraggedItem<T> = {
  id: string;
  data: {
    current: T;
  };
};

export type DraggedColumn = BaseDraggedItem<{
  type: "COLUMN";
  column: DatasetColumn;
  dataSource: VisualizerDataSource;
}>;

export type DraggedItem = DraggedColumn;

export interface VisualizerState {
  display: VisualizationDisplay | null;
  columns: VisualizerDatasetColumn[];
  importedColumns: VisualizerColumnImport[];
  settings: VisualizationSettings;
  cards: Card[];
  datasets: Record<VisualizerDataSourceId, Dataset>;
  expandedDataSources: Record<VisualizerDataSourceId, boolean>;
  loadingDataSources: Record<VisualizerDataSourceId, boolean>;
  loadingDatasets: Record<VisualizerDataSourceId, boolean>;
  error: string | null;
  draggedItem: DraggedItem | null;
}
