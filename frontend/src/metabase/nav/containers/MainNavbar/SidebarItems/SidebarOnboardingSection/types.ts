import type { CollectionTreeItem } from "metabase/entities/collections/utils";
import type { IconName } from "metabase/ui";

export type SidebarOnboardingProps = {
  collections: CollectionTreeItem[];
  hasOwnDatabase: boolean;
  isAdmin: boolean;
};

export type OnboaringMenuItemProps = {
  icon: IconName;
  title: string;
  subtitle: string;
  onClick?: () => void;
};
