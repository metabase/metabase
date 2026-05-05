import { createContext, useContext } from "react";

import type { Card, Document } from "metabase-types/api";

interface PublicDocumentContextValue {
  publicDocumentUuid?: string;
  publicDocument?: Document;
  publicDocumentCards?: Record<number, Card>;
}

const PublicDocumentContext = createContext<PublicDocumentContextValue>({});

export const PublicDocumentProvider = PublicDocumentContext.Provider;

export function usePublicDocumentContext() {
  return useContext(PublicDocumentContext);
}
