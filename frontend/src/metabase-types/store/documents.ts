import type { Card, Document } from "metabase-types/api";

export interface CardEmbedRef {
  id: number;
  name?: string;
}

export interface MentionCacheItem {
  entityId: string;
  model: string;
  name: string;
}

export interface DocumentsState {
  selectedEmbedIndex: number | null;
  cardEmbeds: CardEmbedRef[];
  currentDocument: Document | null;
  draftCards: Record<number, Card>;
  mentionsCache: Record<string, MentionCacheItem>;
  isCommentSidebarOpen: boolean;
  childTargetId: string | undefined;
  hoveredChildTargetId: string | undefined;
  hasUnsavedChanges: boolean;
  isHistorySidebarOpen: boolean;
}
