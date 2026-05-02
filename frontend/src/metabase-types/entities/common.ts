import type { Collection } from "metabase-types/api";

export type WrappedEntity<Entity> = {
  setCollection: (collection: Collection) => void;
} & Entity;
