import type { Collection } from "metabase-types/api";
import type { IconName } from "metabase/ui";

export type WrappedEntity<Entity> = {
  getName: () => string;
  getIcon: () => { name: IconName };
  getColor: () => string;
  getCollection: () => Collection;
} & Entity;
