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
};

export function FilterStep({ query, stageIndex, onChange }: FilterStepProps) {
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
              hasFilters={hasFilters}
              onChange={onChange}
            />
          ))}
          <FilterPopover
            query={query}
            stageIndex={stageIndex}
            hasFilters={hasFilters}
            onChange={onChange}
          />
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
  hasFilters: boolean;
  onChange: (query: Lib.Query) => void;
};

function FilterPopover({
  query,
  stageIndex,
  filter,
  hasFilters,
  onChange,
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
          >
            {filterInfo.displayName}
          </FilterPill>
        ) : (
          <AddFilterButton
            compact={hasFilters}
            onClick={() => setIsOpened(!isOpened)}
          />
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
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
      c="text-light"
      p={compact ? undefined : 0}
      variant={compact ? "default" : "subtle"}
      compact={compact}
      disabled={disabled}
      rightIcon={<Icon name="add" />}
      aria-label={compact ? t`Add filters` : undefined}
      onClick={onClick}
    >
      {!compact && t`Add filters to narrow your answer`}
    </Button>
  );
});
