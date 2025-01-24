import type { GroupItem } from "metabase/querying/filters/types";
import { Flex, Tabs } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { useFilterModalContext } from "../../context";
import { FilterTabList } from "../FilterTabList";
import { FilterTabPanel } from "../FilterTabPanel";

export interface FilterTabContentProps {
  query: Lib.Query;
  groupItems: GroupItem[];
  tab: string | null;
  onChange: (query: Lib.Query) => void;
  onInput: () => void;
  onTabChange: (tab: string | null) => void;
}

export function FilterTabContent({
  query,
  groupItems,
  tab,
  onChange,
  onInput,
  onTabChange,
}: FilterTabContentProps) {
  const { version } = useFilterModalContext();

  return (
    <Tabs value={tab} onTabChange={onTabChange} orientation="vertical" h="100%">
      <Flex direction="row" w="100%">
        {groupItems.length > 1 && <FilterTabList groupItems={groupItems} />}
        {groupItems.map(groupItem => (
          <FilterTabPanel
            key={`${groupItem.key}:${version}`}
            query={query}
            groupItem={groupItem}
            onChange={onChange}
            onInput={onInput}
          />
        ))}
      </Flex>
    </Tabs>
  );
}
