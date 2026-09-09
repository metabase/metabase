import { createContext, useContext } from "react";

import type { Card } from "metabase-types/api";

export interface ExternalCardDataContextValue {
  /** Pre-loaded card metadata, keyed by card ID */
  cards: Record<number, Card>;
  /** Identifier for the external source (e.g., public document UUID) */
  documentUuid: string;
}

const ExternalCardDataContext =
  createContext<ExternalCardDataContextValue | null>(null);

export const ExternalCardDataProvider = ExternalCardDataContext.Provider;

export function useExternalCardData() {
  return useContext(ExternalCardDataContext);
}
