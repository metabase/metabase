import type { IconName } from "metabase/core/components/Icon";
import type { Collection } from "metabase-types/api";

export type WrappedEntity<Entity> = {
  getName: () => string;
  getIcon: () => { name: IconName };
  getColor: () => string;
  getCollection: () => Collection;
} & Entity;
