import { useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Popover,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./SummaryCanvas.module.css";
import { getBlockFilterQuery, getBlockFilters } from "./blocks";
import type { SummaryBase, SummaryBlock } from "./types";

type BlockFiltersProps = {
  base: SummaryBase;
  block: SummaryBlock;
  onChange: (filters: Lib.FilterClause[]) => void;
};

/** Filters that narrow only this summary, on top of the data tab's filters. */
export function BlockFilters({ base, block, onChange }: BlockFiltersProps) {
  const [isAdding, setIsAdding] = useState(false);
  const { stageIndex } = base;
  const filterQuery = getBlockFilterQuery(base, block);
  const sourceFilterCount = Lib.filters(base.query, stageIndex).length;
  const blockFilters = Lib.filters(filterQuery, stageIndex).slice(
    sourceFilterCount,
  );

  const applyFilterQuery = (nextQuery: Lib.Query) =>
    onChange(getBlockFilters(base, nextQuery));

  const handleAdd = (filter: Lib.Filterable) => {
    applyFilterQuery(Lib.filter(filterQuery, stageIndex, filter));
    setIsAdding(false);
  };

  const handleReplace = (
    filter: Lib.FilterClause,
    nextFilter: Lib.Filterable,
  ) =>
    applyFilterQuery(
      Lib.replaceClause(filterQuery, stageIndex, filter, nextFilter),
    );

  const handleRemove = (filter: Lib.FilterClause) =>
    applyFilterQuery(Lib.removeClause(filterQuery, stageIndex, filter));

  return (
    <Flex wrap="wrap" gap="xs" data-testid="summary-block-filters">
      {blockFilters.map((filter, filterIndex) => (
        <BlockFilterPill
          key={filterIndex}
          query={filterQuery}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={sourceFilterCount + filterIndex}
          onChange={(nextFilter) => handleReplace(filter, nextFilter)}
          onRemove={() => handleRemove(filter)}
        />
      ))}
      <Popover
        opened={isAdding}
        onChange={setIsAdding}
        position="bottom-start"
        trapFocus
      >
        <Popover.Target>
          <Button
            size="compact-sm"
            variant="subtle"
            color="filter"
            leftSection={<Icon name="add" size={12} aria-hidden />}
            onClick={() => setIsAdding(!isAdding)}
          >
            {t`Add filter`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <FilterPicker
            query={filterQuery}
            stageIndex={stageIndex}
            onSelect={handleAdd}
            onClose={() => setIsAdding(false)}
          />
        </Popover.Dropdown>
      </Popover>
    </Flex>
  );
}

type BlockFilterPillProps = {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  filterIndex: number;
  onChange: (filter: Lib.Filterable) => void;
  onRemove: () => void;
};

function BlockFilterPill({
  query,
  stageIndex,
  filter,
  filterIndex,
  onChange,
  onRemove,
}: BlockFilterPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const label = Lib.displayInfo(query, stageIndex, filter).displayName;

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="bottom-start"
      trapFocus
    >
      <Popover.Target>
        <Box className={S.filterPill}>
          <UnstyledButton
            className={S.filterPillLabel}
            onClick={() => setIsOpen(!isOpen)}
          >
            {label}
          </UnstyledButton>
          <ActionIcon
            size="sm"
            variant="transparent"
            c="inherit"
            aria-label={t`Remove ${label}`}
            onClick={onRemove}
          >
            <Icon name="close" size={10} />
          </ActionIcon>
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
          onSelect={(nextFilter) => {
            onChange(nextFilter);
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
