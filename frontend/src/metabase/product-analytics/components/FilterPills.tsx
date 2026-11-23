import { useMemo } from "react";

import { FilterPanelPopover } from "metabase/querying/filters/components/FilterPanel/FilterPanelPopover";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { AddFilterButton } from "./AddFilterButton";

type FilterPillsProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
};

export const FilterPills = ({ query, onChange }: FilterPillsProps) => {
  const items = useMemo(() => getFilterItems(query), [query]);

  return (
    <Flex align="center" wrap="wrap" gap="sm" data-testid="analysis-filters">
      {items.map(({ filter, filterIndex, stageIndex }) => (
        <FilterPanelPopover
          key={filterIndex}
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
          onChange={onChange}
        />
      ))}
      <AddFilterButton query={query} onChange={onChange} />
    </Flex>
  );
};
