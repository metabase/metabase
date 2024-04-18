import type { CollectionItem } from "metabase-types/api";

export type OnCopy = (items: CollectionItem[]) => void | null;
export type OnMove = (items: CollectionItem[]) => void | null;
export type OnPin = () => void | null;
export type OnArchive = () => void | null;
export type OnTogglePreview = () => void | null;
export type OnToggleBookmark = () => void | null;
export type OnToggleSelected = (item: CollectionItem) => void | null; // TODO: Not sure the parameter here is right
export type CreateBookmark = (id: string, collection: string) => void;
export type DeleteBookmark = (id: string, collection: string) => void;
