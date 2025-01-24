import { Flex, Tabs } from "metabase/ui";

import { useFilterModalContext } from "../context";

import { FilterTabEmptyState } from "./FilterTabEmptyState";
import { FilterTabList } from "./FilterTabList";
import { FilterTabPanel } from "./FilterTabPanel";

export const FilterModalBody = () => {
  const { groupItems, setTab, tab, version, visibleItems } =
    useFilterModalContext();

  if (groupItems.length === 0) {
    return <FilterTabEmptyState />;
  }

  return (
    <Tabs value={tab} onTabChange={setTab} orientation="vertical" h="100%">
      <Flex direction="row" w="100%">
        {visibleItems.length > 1 && <FilterTabList groupItems={visibleItems} />}
        {visibleItems.map(groupItem => (
          <FilterTabPanel
            key={`${groupItem.key}:${version}`}
            groupItem={groupItem}
          />
        ))}
      </Flex>
    </Tabs>
  );
};
