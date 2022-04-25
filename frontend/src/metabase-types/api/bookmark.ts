export type BookmarkableEntities = "card" | "collection" | "dashboard";

export interface Bookmark {
  authority_level?: string;
  card_id: string;
  display?: string;
  id: string;
  item_id: number;
  name: string;
  type: BookmarkableEntities;
}

export type BookmarksType = Bookmark[];
