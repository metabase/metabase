import { useMemo } from "react";
import type * as Lib from "metabase-lib";
import { FilterPanelPopover } from "./FilterPanelPopover";
import { dropStageIfEmpty, getFilterItems } from "./utils";
import { FilterPanelRoot } from "./FilterPanel.styled";

interface FilterPanelProps {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
}

export function FilterPanel({ query, onChange }: FilterPanelProps) {
  const items = useMemo(() => getFilterItems(query), [query]);

  const handleChange = (query: Lib.Query) => {
    onChange(dropStageIfEmpty(query));
  };

  return (
    <FilterPanelRoot
      align="center"
      wrap="wrap"
      gap="sm"
      px="xl"
      py="sm"
      data-testid="qb-filters-panel"
    >
      {items.map(({ filter, stageIndex }, itemIndex) => (
        <FilterPanelPopover
          key={itemIndex}
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          onChange={handleChange}
        />
      ))}
    </FilterPanelRoot>
  );
}
