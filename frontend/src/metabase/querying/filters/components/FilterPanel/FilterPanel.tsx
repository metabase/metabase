import { type Dispatch, type SetStateAction, useMemo } from "react";
import _ from "underscore";

import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./FilterPanel.module.css";
import { FilterPanelPopover } from "./FilterPanelPopover";
import { FilterPanelPopoverPlus } from "./FilterPanelPopover/FilterPanelPopoverPlus";
import { getFilterItems } from "./utils";

type Filter = {
  id: number;
  filter: Lib.Clause | Lib.SegmentMetadata;
  stageIndex: number;
};

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
    const items = getFilterItems(query).filter(item => {
      return !dirtyRemovedFilters.some(removedFilter => {
        //hack
        const a = Lib.displayInfo(
          query,
          removedFilter.stageIndex,
          removedFilter.filter,
        );
        const b = Lib.displayInfo(query, item.stageIndex, item.filter);
        return _.isEqual(a, b);
      });
    });
    return [...items, ...dirtyAddedFilters];
  }, [query, dirtyAddedFilters, dirtyRemovedFilters]);

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
        onChange={handleChange}
        dirtyAddedFilters={dirtyAddedFilters}
        dirtyRemovedFilters={dirtyRemovedFilters}
        setDirtyAddedFilters={setDirtyAddedFilters}
        setDirtyRemovedFilters={setDirtyRemovedFilters}
      />
    </Flex>
  );
}
