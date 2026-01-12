import type { IconName } from "metabase/ui";

export type PaneHeaderTab = {
  label: string;
  to: string;
  icon?: IconName;
  isSelected?: boolean;
};
