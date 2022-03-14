export type BookmarkableEntities = "card" | "collection";

interface Bookmark {
  id: string;
  card_id: string;
  name: string;
  type: BookmarkableEntities;
}

export type Bookmarks = Bookmark[];
