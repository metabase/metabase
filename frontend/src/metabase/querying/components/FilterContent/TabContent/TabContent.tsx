import { Flex, Tabs } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { TabList } from "../TabList";
import { TabPanel } from "../TabPanel";
import type { GroupItem } from "../types";

export interface TabContentProps {
  query: Lib.Query;
  groupItems: GroupItem[];
  tab: string | null;
  version: number;
  isSearching: boolean;
  onChange: (query: Lib.Query) => void;
  onInput: () => void;
  onTabChange: (tab: string | null) => void;
}

export function TabContent({
  query,
  groupItems,
  tab,
  version,
  isSearching,
  onChange,
  onInput,
  onTabChange,
}: TabContentProps) {
  return (
    <Tabs value={tab} onTabChange={onTabChange} orientation="vertical" h="100%">
      <Flex direction="row" w="100%">
        {groupItems.length > 1 && <TabList groupItems={groupItems} />}
        {groupItems.map(groupItem => (
          <TabPanel
            key={`${groupItem.key}:${version}`}
            query={query}
            groupItem={groupItem}
            isSearching={isSearching}
            onChange={onChange}
            onInput={onInput}
          />
        ))}
      </Flex>
    </Tabs>
  );
}
