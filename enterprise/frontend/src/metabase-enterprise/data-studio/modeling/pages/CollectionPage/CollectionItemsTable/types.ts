import type { IconName } from "metabase/ui";

export type SortColumn = "name" | "description";

export interface ItemIcon {
  name: IconName;
  color?: string;
}
