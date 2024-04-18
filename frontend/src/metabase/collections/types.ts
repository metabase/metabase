import type { CollectionItem } from "metabase-types/api";

export type OnCopy = (items: CollectionItem[]) => void;
export type OnMove = (items: CollectionItem[]) => void;
export type CreateBookmark = (id: string, collection: string) => void;
export type DeleteBookmark = (id: string, collection: string) => void;

interface OwnProps {
  className?: string;
  item: CollectionItem;
  collection: Collection;
  databases?: Database[];
  bookmarks?: Bookmark[];
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
  createBookmark?: (id: string, collection: string) => void;
  deleteBookmark?: (id: string, collection: string) => void;
}
