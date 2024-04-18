import type { CollectionItem } from "metabase-types/api";

export type OnCopy = (items: CollectionItem[]) => void;
export type OnMove = (items: CollectionItem[]) => void;
export type CreateBookmark = (id: string, collection: string) => void;
export type DeleteBookmark = (id: string, collection: string) => void;
