import type {
  Card,
  Dataset,
  DatasetColumn,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerVizDefinition,
} from "metabase-types/api";

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

export interface VisualizerVizDefinitionWithColumns
  extends VisualizerVizDefinition {
  columns: DatasetColumn[];
}

export interface VisualizerVizDefinitionWithColumnsAndFallbacks
  extends VisualizerVizDefinitionWithColumns {
  datasetFallbacks?: Record<number, Dataset | null | undefined>;
}

export interface VisualizerState extends VisualizerVizDefinitionWithColumns {
  initialState: VisualizerVizDefinitionWithColumns;
  cards: Card[];
  datasets: Record<VisualizerDataSourceId, Dataset>;
  loadingDataSources: Record<VisualizerDataSourceId, boolean>;
  loadingDatasets: Record<VisualizerDataSourceId, boolean>;
  error: string | null;
  draggedItem: DraggedItem | null;
  hoveredItems: DraggedColumn[] | null;
}
