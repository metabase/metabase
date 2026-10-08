import type {
  Card,
  CardId,
  Document,
  StoredResultSort,
  TimelineEventId,
} from "metabase-types/api";

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

export type DocumentsSidebar =
  | { mode: "viz-settings"; embedIndex: number }
  | {
      mode: "timeline-events";
      embedIndex: number;
      focusedEventIds: TimelineEventId[] | null;
      selectedEventIds: TimelineEventId[];
    }
  | { mode: "comments" }
  | { mode: "history" };

export interface DocumentsState {
  sidebar: DocumentsSidebar | null;
  cardEmbeds: CardEmbedRef[];
  currentDocument: Document | null;
  draftCards: Record<number, Card>;
  draftCardOriginalIds: Record<number, CardId>;
  mentionsCache: Record<string, MentionCacheItem>;
  childTargetId: string | undefined;
  hoveredChildTargetId: string | undefined;
  hasUnsavedChanges: boolean;
}
