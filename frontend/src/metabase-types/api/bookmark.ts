export type BookmarkableEntities = "card" | "collection";

export interface Bookmark {
  card_id: string;
  display?: string;
  id: string;
  item_id: number;
  name: string;
  type: BookmarkableEntities;
}

export type Bookmarks = Bookmark[];
