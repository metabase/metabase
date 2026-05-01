import type { Collection } from "metabase-types/api";

export type WrappedEntity<Entity> = {
  getCollection: () => Collection;
  setCollection: (collection: Collection) => void;
  setPinned: (isPinned: boolean) => void;
} & Entity;
