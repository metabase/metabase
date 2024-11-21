import { useState } from "react";
import { t } from "ttag";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ClauseStep } from "metabase/querying/segments/components/SegmentEditor/ClauseStep";
import { Button, Flex, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

type FilterStepProps = {
  query: Lib.Query | undefined;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

export function FilterStep({ query, stageIndex, onChange }: FilterStepProps) {
  const filters = query ? Lib.filters(query, stageIndex) : [];

  return (
    <ClauseStep label={t`Filtered by`}>
      {query && (
        <Flex align="center" gap="md">
          {filters.map((filter, filterIndex) => (
            <FilterPopover
              key={filterIndex}
              query={query}
              stageIndex={stageIndex}
              filter={filter}
              onChange={onChange}
            />
          ))}
          <FilterPopover
            query={query}
            stageIndex={stageIndex}
            onChange={onChange}
          />
        </Flex>
      )}
    </ClauseStep>
  );
}

type FilterPopoverProps = {
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;
  onChange: (query: Lib.Query) => void;
};

function FilterPopover({
  query,
  stageIndex,
  filter,
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
          <Button
            variant="subtle"
            p={0}
            c="text-light"
            rightIcon={<Icon name="add" />}
            onClick={() => setIsOpened(!isOpened)}
          >
            {t`Add filters`}
          </Button>
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
