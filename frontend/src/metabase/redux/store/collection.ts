import type { Collection, CollectionId, IconName } from "metabase-types/api";

// see entities/collections/getExpandedCollectionsById.js
export type ExpandedCollection = Collection & {
  path: string;
  parent: ExpandedCollection;
  children: ExpandedCollection[];
  is_personal: boolean;
};

export type CollectionTreeItem = {
  id: CollectionId;
  name: string;
  icon: IconName | any;
  children?: CollectionTreeItem[];
};
