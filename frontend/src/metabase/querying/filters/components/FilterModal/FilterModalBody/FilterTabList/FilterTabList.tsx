import { Icon, Tabs } from "metabase/ui";

import type { GroupItem } from "../../types";

import { TabsListSidebar } from "./FilterTabList.styled";

export interface TabListProps {
  groupItems: GroupItem[];
}

export function FilterTabList({ groupItems }: TabListProps) {
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
