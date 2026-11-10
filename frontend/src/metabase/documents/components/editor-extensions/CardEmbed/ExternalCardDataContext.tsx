import { createContext, useContext } from "react";

import type { Card, CardId, TimelineEvent } from "metabase-types/api";

export interface ExternalCardDataContextValue {
  /** Pre-loaded card metadata, keyed by card ID */
  cards: Record<number, Card>;
  /** The timeline events each card shows, keyed by card ID */
  timelineEvents: Record<CardId, TimelineEvent[]>;
  /** Identifier for the external source (e.g., public document UUID) */
  documentUuid: string;
}

const ExternalCardDataContext =
  createContext<ExternalCardDataContextValue | null>(null);

export const ExternalCardDataProvider = ExternalCardDataContext.Provider;

export function useExternalCardData() {
  return useContext(ExternalCardDataContext);
}
