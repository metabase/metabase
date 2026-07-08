import cx from "classnames";
import { useMemo } from "react";

import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./FilterPanel.module.css";
import { FilterPanelPopover } from "./FilterPanelPopover";
import { getFilterItems } from "./utils";

interface FilterPanelProps {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
  className?: string;
}

export function FilterPanel({ query, onChange, className }: FilterPanelProps) {
  const items = useMemo(() => getFilterItems(query), [query]);

  const handleChange = (query: Lib.Query) => {
    onChange(Lib.dropEmptyStages(query));
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <Flex
      className={cx(S.FilterPanelRoot, className)}
      align="center"
      wrap="wrap"
      gap="sm"
      py="sm"
      data-testid="qb-filters-panel"
    >
      {items.map(({ filter, filterIndex, stageIndex }, itemIndex) => (
        <FilterPanelPopover
          key={itemIndex}
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
          onChange={handleChange}
        />
      ))}
    </Flex>
  );
}
