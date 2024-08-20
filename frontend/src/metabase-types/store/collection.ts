import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";
import type { Collection, CollectionId } from "metabase-types/api";

// see entities/collections/getExpandedCollectionsById.js
export type ExpandedCollection = Collection & {
  path: string;
  parent: ExpandedCollection;
  children: ExpandedCollection[];
  is_personal: boolean;
};

export type CollectionTreeItem = {
  id: CollectionId;
  name: string | ReactNode;
  icon: IconName | any;
  children?: CollectionTreeItem[];
};
