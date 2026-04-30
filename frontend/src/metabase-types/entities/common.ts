import type { Collection } from "metabase-types/api";

export type WrappedEntity<Entity> = {
  getName: () => string;
  getCollection: () => Collection;
  setArchived: (isArchived: boolean) => void;
  setCollection: (collection: Collection) => void;
  setCollectionPreview: (isEnabled: boolean) => void;
  setPinned: (isPinned: boolean) => void;
} & Entity;
