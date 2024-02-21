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

  // For questions and models
  dataset?: boolean;
}
