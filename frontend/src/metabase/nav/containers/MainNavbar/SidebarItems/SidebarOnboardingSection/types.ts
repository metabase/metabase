import type { CollectionTreeItem } from "metabase/entities/collections/utils";
import type { IconName } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

export type SidebarOnboardingProps = {
  collections: CollectionTreeItem[];
  databases: Database[];
  hasOwnDatabase: boolean;
  isAdmin: boolean;
};

export type OnboaringMenuItemProps = {
  icon: IconName;
  title: string;
  subtitle: string;
  onClick?: () => void;
};
