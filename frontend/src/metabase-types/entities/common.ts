import type { IconProps } from "metabase/ui";
import type { Collection } from "metabase-types/api";

export type WrappedEntity<Entity> = {
  getName: () => string;
  getIcon: () => IconProps;
  getColor: () => string;
  getCollection: () => Collection;
  getUrl: () => string;
  setArchived: (isArchived: boolean) => void;
  setCollection: (collection: Collection) => void;
  setCollectionPreview: (isEnabled: boolean) => void;
  setPinned: (isPinned: boolean) => void;
} & Entity;
