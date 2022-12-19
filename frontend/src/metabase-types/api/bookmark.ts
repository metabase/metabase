export type BookmarkType = "card" | "collection" | "dashboard";

export interface Bookmark {
  authority_level?: string;
  card_id: string;
  display?: string;
  id: string;
  item_id: number;
  name: string;
  type: BookmarkType;

  // For questions and models
  dataset?: boolean;

  // For data app collections
  app_id?: number;
}
