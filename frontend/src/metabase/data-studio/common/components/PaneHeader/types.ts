import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";

export type PaneHeaderTab = {
  label: string;
  to: string;
  icon?: IconName;
  rightSection?: ReactNode;
  isSelected?: boolean | ((pathname: string) => boolean);
};
