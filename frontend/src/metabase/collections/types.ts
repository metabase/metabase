import type {
  BookmarkId,
  BookmarkType,
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";
import type { CollectionOrTableIdProps } from "./components/ModelUploadModal";

export type OnCopy = (items: CollectionItem[]) => void | null;
export type OnCopyWithoutArguments = () => void;
export type OnMove = (items: CollectionItem[]) => Promise<any> | void;
export type OnMoveWithOneItem = (
  item: Pick<Collection, "id"> & Partial<Collection>,
) => Promise<any> | void;
export type OnMoveWithOneFullCollection = (
  item: Collection, // NOTE: I don't know if / why this disjunction is needed
) => Promise<any>;
export type OnMoveWithSourceAndDestination = (
  source: Collection | CollectionItem,
  destination: { id: CollectionId },
) => Promise<any>;
export type OnMoveById = (id: CollectionId) => void;
export type OnPin = () => void | null;
export type OnArchive = (() => Promise<any> | void) | null;
export type OnTogglePreview = () => void | null;
export type OnToggleBookmark = () => void | null;

// perhaps both of these are needed in different places
export type OnToggleSelected = () => void | null; // TODO: Not sure the parameter here is right
export type OnToggleSelectedWithItem = (item: CollectionItem) => void; // TODO: Not sure the parameter here is right

// TODO: This type signature works for some files but I'm wondering if a more specific type signature is better
// export type CreateBookmark = (id: string, collection: string) => void; TODO delete if possible
export type CreateBookmark = (id: BookmarkId, collection: BookmarkType) => void;
// TODO: How can collection be a BookmarkType (i.e. either "card", "collection", or "dashboard")

// export type DeleteBookmark = (id: string, collection: string) => void; TODO delete if possible
export type DeleteBookmark = (id: BookmarkId, type: BookmarkType) => void;

export type OnFileUpload = (props: CollectionOrTableIdProps) => void;

export type UploadFile = (
  props: { file: File } & CollectionOrTableIdProps,
) => void;
