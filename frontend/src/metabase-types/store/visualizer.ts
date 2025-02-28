import type {
  Card,
  Dataset,
  DatasetColumn,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

export type VisualizerDataSourceType = "card";
export type VisualizerDataSourceId = `${VisualizerDataSourceType}:${number}`;

export type VisualizerDataSourceDashboard = {
  id: number;
  name: string;
};

export type VisualizerDataSource = {
  id: VisualizerDataSourceId;
  sourceId: number;
  type: VisualizerDataSourceType;
  name: string;
  dashboard: VisualizerDataSourceDashboard;
};

export type VisualizerColumnReference = {
  sourceId: VisualizerDataSourceId;
  name: string; // in combined dataset
  originalName: string; // in original dataset
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

export type DraggedWellItem = BaseDraggedItem<{
  type: "WELL_ITEM";
  wellId: string;
  column: DatasetColumn;
}>;

export type DraggedItem = DraggedColumn | DraggedWellItem;

// a way to use dataset's name as a value
export type VisualizerDataSourceNameReference =
  `$_${VisualizerDataSourceId}_name`;

export type VisualizerColumnValueSource =
  | VisualizerColumnReference
  | VisualizerDataSourceNameReference;

export type VisualizerHistoryItem = {
  display: VisualizationDisplay | null;
  columns: DatasetColumn[];
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>;
  settings: VisualizationSettings;
};

export type VisualizerCommonState = {
  cards: Card[];
  datasets: Record<VisualizerDataSourceId, Dataset>;
  expandedDataSources: Record<VisualizerDataSourceId, boolean>;
  loadingDataSources: Record<VisualizerDataSourceId, boolean>;
  loadingDatasets: Record<VisualizerDataSourceId, boolean>;
  isFullscreen: boolean;
  isVizSettingsSidebarOpen: boolean;
  error: string | null;
  draggedItem: DraggedItem | null;
};

export interface VisualizerState extends VisualizerCommonState {
  past: VisualizerHistoryItem[];
  present: VisualizerHistoryItem;
  future: VisualizerHistoryItem[];

  initialState: VisualizerHistoryItem;
}
