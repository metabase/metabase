import { createContext, useContext } from "react";

import type { Card, Dataset } from "metabase-types/api";

export interface ExternalCardDataContextValue {
  /** Pre-loaded card metadata, keyed by card ID */
  cards: Record<number, Card>;
  /** Identifier for the external source (e.g., public document UUID) */
  documentUuid: string;
  /** Load query results for a card from the external source */
  loadCardQuery: (cardId: number) => Promise<Dataset>;
}

const ExternalCardDataContext =
  createContext<ExternalCardDataContextValue | null>(null);

export const ExternalCardDataProvider = ExternalCardDataContext.Provider;

export function useExternalCardData() {
  return useContext(ExternalCardDataContext);
}
