import type { IconName } from "metabase-types/api";
export type PaneHeaderTab = {
  label: string;
  to: string;
  icon?: IconName;
  isGated?: boolean;
  isSelected?: boolean | ((pathname: string) => boolean);
};
