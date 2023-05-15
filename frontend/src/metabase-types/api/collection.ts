import { UserId } from "./user";
import { CardDisplayType } from "./card";
import { DatabaseId } from "./database";

export type RegularCollectionId = number;

export type CollectionId = RegularCollectionId | "root" | "personal";

export type CollectionContentModel = "card" | "dataset";

export type CollectionAuthorityLevel = "official" | null;

export type CollectionAuthorityLevelConfig = {
  type: CollectionAuthorityLevel;
  name: string;
  icon: string;
  color?: string;
  tooltips?: Record<string, string>;
};

export interface Collection {
  id: CollectionId;
  name: string;
  description: string | null;
  can_write: boolean;
  color?: string;
  archived: boolean;
  children?: Collection[];
  authority_level?: "official" | null;

  parent_id?: CollectionId;
  personal_owner_id?: UserId;

  location?: string;
  effective_ancestors?: Collection[];

  here?: CollectionContentModel[];
  below?: CollectionContentModel[];

  // Assigned on FE
  originalName?: string;
  path?: CollectionId[];
}

type CollectionItemModel =
  | "card"
  | "dataset"
  | "dashboard"
  | "pulse"
  | "collection";

export type CollectionItemId = number;

export interface CollectionItem<T = CollectionItemModel> {
  id: CollectionItemId;
  model: T;
  name: string;
  description: string | null;
  copy?: boolean;
  collection_position?: number | null;
  collection_preview?: boolean | null;
  fully_parametrized?: boolean | null;
  collection?: Collection;
  display?: CardDisplayType;
  personal_owner_id?: UserId;
  database_id?: DatabaseId;
  moderated_status?: string;
  getIcon: () => { name: string };
  getUrl: (opts?: Record<string, unknown>) => string;
  setArchived?: (isArchived: boolean) => void;
  setPinned?: (isPinned: boolean) => void;
  setCollection?: (collection: Collection) => void;
  setCollectionPreview?: (isEnabled: boolean) => void;
}
