import { useMemo } from "react";

import { FilterPanelPopover } from "metabase/querying/filters/components/FilterPanel/FilterPanelPopover";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

type XrayFilterPillsProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
};

/** The query's active filters as editable, removable pills; renders nothing without filters. */
export function XrayFilterPills({ query, onChange }: XrayFilterPillsProps) {
  const items = useMemo(() => getFilterItems(query), [query]);

  if (items.length === 0) {
    return null;
  }

  return (
    <Flex align="center" wrap="wrap" gap="sm" data-testid="xray-filter-pills">
      {items.map(({ filter, filterIndex, stageIndex }, itemIndex) => (
        <FilterPanelPopover
          key={itemIndex}
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
          onChange={(nextQuery) => onChange(Lib.dropEmptyStages(nextQuery))}
        />
      ))}
    </Flex>
  );
}
