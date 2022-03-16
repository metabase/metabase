export type BookmarkableEntities = "card" | "collection";

export interface Bookmark {
  id: number;
  item_id: string;
  card_id: string;
  name: string;
  type: BookmarkableEntities;
}

export type Bookmarks = Bookmark[];
