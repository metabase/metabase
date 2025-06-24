import type {
  BookmarkId,
  BookmarkType,
  Collection,
  CollectionId,
  CollectionItem,
  Dashboard,
} from "metabase-types/api";

import type { CollectionOrTableIdProps } from "./components/ModelUploadModal";

export type MoveCollectionDestination = Pick<Collection, "id"> & {
  model: "collection";
} & Partial<Collection>;
export type MoveDashboardDestination = Pick<Dashboard, "id"> & {
  model: "dashboard";
} & Partial<Dashboard>;
export type MoveDestination =
  | MoveCollectionDestination
  | MoveDashboardDestination;

export type OnCopy = (items: CollectionItem[]) => void | null;
export type OnCopyWithoutArguments = () => void;
export type OnMove = (items: CollectionItem[]) => Promise<any> | void;
export type OnMoveWithOneItem<D = MoveDestination> = (
  destination: D,
) => Promise<any> | void;
export type OnMoveWithSourceAndDestination = (
  source: Collection | CollectionItem,
  destination: MoveDestination,
) => Promise<any>;
export type OnMoveById = (id: CollectionId) => void;
export type OnPin = () => void | null;
export type OnArchive = (() => Promise<any>) | null;
export type OnRestore = (() => Promise<any> | void) | null;
export type OnDeletePermanently = (() => Promise<any> | void) | null;
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
