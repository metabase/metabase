export type BookmarkableEntities = "card" | "collection";

export interface Bookmark {
  id: string;
  item_id: number;
  card_id: string;
  name: string;
  type: BookmarkableEntities;
}

export type Bookmarks = Bookmark[];
