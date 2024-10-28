import type {
  Card,
  CardId,
  Dataset,
  DatasetColumn,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

type VisualizerDataSourceType = "card";

export type VisualizerDataSource = {
  id: number;
  type: VisualizerDataSourceType;
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
}>;

export type DraggedItem = DraggedColumn;

export interface VisualizerState {
  display: VisualizationDisplay | null;
  settings: VisualizationSettings;

  cards: Card[];
  datasets: Record<CardId, Dataset>;
  expandedCards: Record<CardId, boolean>;
  loadingCards: Record<CardId, boolean>;
  loadingDatasets: Record<CardId, boolean>;
  error: string | null;
  draggedItem: DraggedItem | null;
}
