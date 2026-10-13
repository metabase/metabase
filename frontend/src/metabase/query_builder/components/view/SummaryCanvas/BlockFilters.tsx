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
import { getBlockFilterEditQuery, toBlockFilter } from "./blocks";
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
  const editQuery = getBlockFilterEditQuery(base, block);

  const handleAdd = (filterable: Lib.Filterable) => {
    const filter = toBlockFilter(base, filterable);
    if (filter) {
      onChange([...block.filters, filter]);
    }
    setIsAdding(false);
  };

  const handleReplace = (filterIndex: number, filterable: Lib.Filterable) => {
    const filter = toBlockFilter(base, filterable);
    if (filter) {
      onChange(
        block.filters.map((current, index) =>
          index === filterIndex ? filter : current,
        ),
      );
    }
  };

  const handleRemove = (filterIndex: number) =>
    onChange(block.filters.filter((_filter, index) => index !== filterIndex));

  return (
    <Flex wrap="wrap" gap="xs" data-testid="summary-block-filters">
      {block.filters.map((filter, filterIndex) => (
        <BlockFilterPill
          key={filterIndex}
          query={editQuery}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
          onChange={(nextFilter) => handleReplace(filterIndex, nextFilter)}
          onRemove={() => handleRemove(filterIndex)}
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
            query={editQuery}
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
