import type { IconName } from "metabase/ui";
import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  CollectionNamespace,
} from "metabase-types/api";

export type LibrarySectionType = "data" | "metrics" | "snippets";

export type EmptyStateData = {
  model: "empty-state";
  sectionType: LibrarySectionType;
  description: string;
  actionLabel: string;
  actionUrl?: string;
};

export type TreeItemModel = CollectionItemModel | "empty-state";

export type TreeItem = {
  id: string;
  name: string;
  icon: IconName;
  updatedAt?: string;
  model: TreeItemModel;
  data:
    | ((Collection | Omit<CollectionItem, "getUrl">) & {
        model: CollectionItem["model"];
        namespace?: CollectionNamespace | null;
      })
    | EmptyStateData;
  children?: TreeItem[];
};
