import type { Card, Document, StoredResultSort } from "metabase-types/api";

export interface CardEmbedRef {
  id: number;
  name?: string;
  stored_result_id?: number | null;
  sort?: StoredResultSort | null;
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
