import { Flex, Tabs } from "metabase/ui";

import { useFilterModalContext } from "../../context";
import { FilterTabList } from "../FilterTabList";
import { FilterTabPanel } from "../FilterTabPanel";

export function FilterTabContent() {
  const { tab, visibleItems, onTabChange } = useFilterModalContext();

  return (
    <Tabs value={tab} onChange={onTabChange} orientation="vertical" h="100%">
      <Flex direction="row" w="100%">
        {visibleItems.length > 1 && <FilterTabList groupItems={visibleItems} />}
        {visibleItems.map(groupItem => (
          <FilterTabPanel key={groupItem.key} groupItem={groupItem} />
        ))}
      </Flex>
    </Tabs>
  );
}
