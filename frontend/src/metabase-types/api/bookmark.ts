import type { CardId, CardType } from "./card";
import type { CollectionId } from "./collection";
import type { DashboardId } from "./dashboard";

export const BOOKMARK_TYPES = [
  "card",
  "collection",
  "dashboard",
  "snippet",
  "indexed-entity",
] as const;
export type BookmarkType = (typeof BOOKMARK_TYPES)[number];
export type BookmarkId = string;

export interface Bookmark {
  authority_level?: string;
  card_id?: string;
  dashboard_id?: number;
  display?: string;
  id: BookmarkId;
  item_id: number;
  name: string;
  type: BookmarkType;
  /**
   * Defined only when bookmark.type is "card"
   */
  card_type?: CardType;
}

export interface BookmarkOrdering {
  type: BookmarkType;
  item_id: number;
}

export interface CreateBookmarkRequest {
  id: CardId | CollectionId | DashboardId;
  type: BookmarkType;
}

export interface DeleteBookmarkRequest {
  id: CardId | CollectionId | DashboardId;
  type: BookmarkType;
}

export interface ReorderBookmarksRequest {
  orderings: BookmarkOrdering[];
}
