import type { IconName } from "metabase/ui";
import type { OrderByDirection } from "metabase-lib";

export type EditableTableColumnSettingItem = {
  id: string;
  name: string;
  title: string;
  enabled: boolean;
  editable: boolean;
  icon: IconName;
  sortDirection: OrderByDirection | undefined;
};
