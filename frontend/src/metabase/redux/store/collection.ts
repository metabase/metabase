import type { Collection, CollectionId, IconName } from "metabase-types/api";

// the shape metabase/common/collections/getExpandedCollectionsById builds
export type ExpandedCollection = Omit<Collection, "path" | "children"> & {
  path: CollectionId[] | null;
  parent: ExpandedCollection | null;
  children: ExpandedCollection[];
};

export type CollectionTreeItem = {
  id: CollectionId;
  name: string;
  icon: IconName | any;
  children?: CollectionTreeItem[];
};
