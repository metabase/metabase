import type { IconName } from "metabase/ui";
import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  CollectionNamespace,
} from "metabase-types/api";

export type TreeItem = {
  id: string;
  name: string;
  icon: IconName;
  updatedAt?: string;
  model: CollectionItemModel;
  data: (Collection | Omit<CollectionItem, "getUrl">) & {
    model: CollectionItem["model"];
    namespace?: CollectionNamespace | null;
  };
  children?: TreeItem[];
};

export const isCollection = (
  c: Collection | Omit<CollectionItem, "getUrl">,
): c is Collection => {
  return Object.keys(c).includes("namespace");
};
