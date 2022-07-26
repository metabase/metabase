export type CollectionId = number | "root";

export type CollectionContentModel = "card" | "dataset";

export type CollectionAuthorityLevel = "official" | null;

export interface Collection {
  id: CollectionId;
  name: string;
  description: string | null;
  can_write: boolean;
  archived: boolean;
  children?: Collection[];

  personal_owner_id?: number;

  location?: string;
  effective_ancestors?: Collection[];

  here?: CollectionContentModel[];
  below?: CollectionContentModel[];

  // Assigned on FE
  originalName?: string;
  path?: CollectionId[];
}

export interface CollectionItem {
  id: number;
  model: string;
  name: string;
  description: string | null;
  copy?: boolean;
  collection_position?: number | null;
  collection_preview?: boolean | null;
  fully_parametrized?: boolean | null;
  getIcon: () => { name: string };
  getUrl: () => string;
  setArchived?: (isArchived: boolean) => void;
  setPinned?: (isPinned: boolean) => void;
  setCollection?: (collection: Collection) => void;
  setCollectionPreview?: (isEnabled: boolean) => void;
}
