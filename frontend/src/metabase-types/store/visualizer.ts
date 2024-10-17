import type { Card, CardId, Dataset } from "metabase-types/api";

export interface VisualizerState {
  cards: Card[];
  datasets: Record<CardId, Dataset>;
  expandedCards: Record<CardId, boolean>;
  loadingCards: Record<CardId, boolean>;
  loadingDatasets: Record<CardId, boolean>;
  error: string | null;
  selectedCardId: CardId | null;
}
