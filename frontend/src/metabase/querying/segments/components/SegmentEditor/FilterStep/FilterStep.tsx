import { type Ref, forwardRef, useState } from "react";
import { t } from "ttag";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Button, Flex, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ClauseStep } from "../ClauseStep";

type FilterStepProps = {
  query: Lib.Query | undefined;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
  readOnly?: boolean;
};

export function FilterStep({
  query,
  stageIndex,
  onChange,
  readOnly,
}: FilterStepProps) {
  const filters = query ? Lib.filters(query, stageIndex) : [];
  const hasFilters = filters.length > 0;

  return (
    <ClauseStep label={t`Filtered by`}>
      {query ? (
        <Flex align="center" gap="md" wrap="wrap">
          {filters.map((filter, filterIndex) => (
            <FilterPopover
              key={filterIndex}
              query={query}
              stageIndex={stageIndex}
              filter={filter}
              filterIndex={filterIndex}
              hasFilters={hasFilters}
              onChange={onChange}
              readOnly={readOnly}
            />
          ))}
          {!readOnly && (
            <FilterPopover
              query={query}
              stageIndex={stageIndex}
              hasFilters={hasFilters}
              onChange={onChange}
              readOnly={readOnly}
            />
          )}
        </Flex>
      ) : (
        <AddFilterButton disabled />
      )}
    </ClauseStep>
  );
}

type FilterPopoverProps = {
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;
  filterIndex?: number;
  hasFilters: boolean;
  readOnly?: boolean;
  onChange: (query: Lib.Query) => void;
};

function FilterPopover({
  query,
  stageIndex,
  filter,
  filterIndex,
  hasFilters,
  onChange,
  readOnly,
}: FilterPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);
  const filterInfo = filter
    ? Lib.displayInfo(query, stageIndex, filter)
    : undefined;

  const handleSelect = (newFilter: Lib.Filterable) => {
    const newQuery = filter
      ? Lib.replaceClause(query, stageIndex, filter, newFilter)
      : Lib.filter(query, stageIndex, newFilter);
    onChange(newQuery);
    setIsOpened(false);
  };

  const handleRemove = () => {
    if (filter) {
      const newQuery = Lib.removeClause(query, stageIndex, filter);
      onChange(newQuery);
    }
  };

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        {filterInfo ? (
          <FilterPill
            onClick={() => setIsOpened(!isOpened)}
            onRemoveClick={handleRemove}
            readOnly={readOnly}
          >
            {filterInfo.displayName}
          </FilterPill>
        ) : (
          <AddFilterButton
            compact={hasFilters}
            onClick={() => setIsOpened(!isOpened)}
            disabled={readOnly}
          />
        )}
      </Popover.Target>
      <Popover.Dropdown data-testid="segment-popover">
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
          onSelect={handleSelect}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type AddFilterButtonProps = {
  compact?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

const AddFilterButton = forwardRef(function AddFilterButton(
  { compact, disabled, onClick }: AddFilterButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <Button
      ref={ref}
      c="text-tertiary"
      p={compact ? undefined : 0}
      variant={compact ? "default" : "subtle"}
      size={compact ? "compact-md" : "md"}
      disabled={disabled}
      rightSection={<Icon name="add" />}
      aria-label={compact ? t`Add filters` : undefined}
      onClick={onClick}
    >
      {!compact && t`Add filters to narrow your answer`}
    </Button>
  );
});
