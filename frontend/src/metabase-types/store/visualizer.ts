import type {
  Card,
  CardId,
  Dataset,
  DatasetColumn,
  VisualizationSettings,
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
}>;

export type DraggedItem = DraggedColumn;

export interface VisualizerState {
  settings: VisualizationSettings;
  cards: Card[];
  datasets: Record<CardId, Dataset>;
  expandedCards: Record<CardId, boolean>;
  loadingCards: Record<CardId, boolean>;
  loadingDatasets: Record<CardId, boolean>;
  error: string | null;
  selectedCardId: CardId | null;
  draggedItem: DraggedItem | null;
}
