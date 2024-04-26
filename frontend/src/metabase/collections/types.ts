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
export type OnMoveWithSourceAndDestination = (
  source: Collection | CollectionItem,
  destination: { id: CollectionId },
) => Promise<any>;
export type OnMoveById = (id: CollectionId) => void;
export type OnPin = () => void | null;
export type OnArchive = (() => Promise<any> | void) | null;
export type OnTogglePreview = () => void | null;
export type OnToggleBookmark = () => void | null;
export type OnDrop = () => void;
export type OnToggleSelected = () => void | null;
export type OnToggleSelectedWithItem = (item: CollectionItem) => void;
export type CreateBookmark = (id: BookmarkId, collection: BookmarkType) => void;
export type DeleteBookmark = (id: BookmarkId, type: BookmarkType) => void;
export type OnFileUpload = (props: CollectionOrTableIdProps) => void;
export type UploadFile = (
  props: { file: File } & CollectionOrTableIdProps,
) => void;
