import type { CardType } from "./card";

export type BookmarkType = "card" | "collection" | "dashboard";
export type BookmarkId = string;

export interface Bookmark {
  authority_level?: string;
  card_id?: string;
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
