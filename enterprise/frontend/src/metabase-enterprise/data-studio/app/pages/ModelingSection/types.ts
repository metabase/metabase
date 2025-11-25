import type { IconName } from "metabase/ui";
import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  CollectionNamespace,
} from "metabase-types/api";

export type TreeItem = {
  name: string;
  icon: IconName;
  updatedAt?: string;
  model: CollectionItemModel;
  data: (Collection | CollectionItem) & {
    model: CollectionItem["model"];
    namespace?: CollectionNamespace;
  };
  children?: TreeItem[];
  id: number | string;
};

export const isCollection = (
  c: Collection | CollectionItem,
): c is Collection => {
  return Object.keys(c).includes("namespace");
};
