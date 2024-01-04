import { useMemo } from "react";
import type * as Lib from "metabase-lib";
import { FilterPopover } from "./FilterPopover";
import { getFilterItems } from "./utils";
import { FilterBarRoot } from "./FilterBar.styled";

interface FilterBarProps {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
}

export function FilterBar({ query, onChange }: FilterBarProps) {
  const items = useMemo(() => getFilterItems(query), [query]);

  return (
    <FilterBarRoot align="center" wrap="wrap" gap="sm" px="xl" py="sm">
      {items.map(({ filter, stageIndex }, itemIndex) => (
        <FilterPopover
          key={itemIndex}
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          onChange={onChange}
        />
      ))}
    </FilterBarRoot>
  );
}
