import type {
  Card,
  CardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";

export interface VisualizerState {
  settings: VisualizationSettings;
  cards: Card[];
  datasets: Record<CardId, Dataset>;
  expandedCards: Record<CardId, boolean>;
  loadingCards: Record<CardId, boolean>;
  loadingDatasets: Record<CardId, boolean>;
  error: string | null;
  selectedCardId: CardId | null;
}
