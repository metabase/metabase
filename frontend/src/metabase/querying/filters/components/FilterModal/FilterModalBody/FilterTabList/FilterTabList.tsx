import type { GroupItem } from "metabase/querying/filters/types";
import { Icon, Tabs } from "metabase/ui";

import { TabsListSidebar } from "./FilterTabList.styled";

export interface FilterTabListProps {
  groupItems: GroupItem[];
}

export function FilterTabList({ groupItems }: FilterTabListProps) {
  return (
    <TabsListSidebar w="25%" pt="sm" pl="md">
      {groupItems.map(groupItem => (
        <Tabs.Tab
          key={groupItem.key}
          value={groupItem.key}
          aria-label={groupItem.displayName}
          icon={<Icon name={groupItem.icon} />}
        >
          {groupItem.displayName}
        </Tabs.Tab>
      ))}
    </TabsListSidebar>
  );
}
