import type { IconName } from "metabase/ui";

export type SidebarOnboardingProps = {
  hasOwnDatabase: boolean;
  isAdmin: boolean;
};

export type OnboaringMenuItemProps = {
  icon: IconName;
  title: string;
  subtitle: string;
  onClick?: () => void;
};
