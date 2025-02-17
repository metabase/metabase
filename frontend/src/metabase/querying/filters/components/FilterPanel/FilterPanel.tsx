import { type Dispatch, type SetStateAction, useMemo } from "react";

import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./FilterPanel.module.css";
import { FilterPanelPopover } from "./FilterPanelPopover";
import { FilterPanelPopoverPlus } from "./FilterPanelPopover/FilterPanelPopoverPlus";
import { getFilterItems } from "./utils";

type Filter = Lib.Clause | Lib.SegmentMetadata;

interface FilterPanelProps {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
  dirtyAddedFilters: Filter[];
  dirtyRemovedFilters: Filter[];
  setDirtyAddedFilters: Dispatch<SetStateAction<Filter[]>>;
  setDirtyRemovedFilters: Dispatch<SetStateAction<Filter[]>>;
}

export function FilterPanel({
  query,
  onChange,

  dirtyAddedFilters,
  dirtyRemovedFilters,
  setDirtyAddedFilters,
  setDirtyRemovedFilters,
}: FilterPanelProps) {
  const items = useMemo(() => {
    const items = getFilterItems(query);

    const dirtyAddedFilterItems = dirtyAddedFilters.map(filter => ({
      filter,
      stageIndex: -1,
    }));

    return [...items, ...dirtyAddedFilterItems];
  }, [query, dirtyAddedFilters]);

  const handleChange = (query: Lib.Query) => {
    onChange(Lib.dropEmptyStages(query));
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <Flex
      className={S.FilterPanelRoot}
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
          dirtyAddedFilters={dirtyAddedFilters}
          dirtyRemovedFilters={dirtyRemovedFilters}
          setDirtyAddedFilters={setDirtyAddedFilters}
          setDirtyRemovedFilters={setDirtyRemovedFilters}
        />
      ))}

      <FilterPanelPopoverPlus
        query={query}
        stageIndex={-1}
        onChange={handleChange}
        dirtyAddedFilters={dirtyAddedFilters}
        dirtyRemovedFilters={dirtyRemovedFilters}
        setDirtyAddedFilters={setDirtyAddedFilters}
        setDirtyRemovedFilters={setDirtyRemovedFilters}
      />
    </Flex>
  );
}
