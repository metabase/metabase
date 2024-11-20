import { useState } from "react";
import { t } from "ttag";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ClauseStep } from "metabase/querying/segments/components/SegmentEditor/ClauseStep";
import { Button, Flex, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

type FilterStepProps = {
  query: Lib.Query | undefined;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

export function FilterStep({ query, stageIndex, onChange }: FilterStepProps) {
  const filters = query ? Lib.filters(query, stageIndex) : [];

  return (
    <ClauseStep label={t`Filters`}>
      {query && (
        <Flex>
          {filters.map((filter, filterIndex) => (
            <ChangeFilterPopover
              key={filterIndex}
              query={query}
              stageIndex={stageIndex}
              filter={filter}
              onChange={onChange}
            />
          ))}
          <AddFilterPopover
            query={query}
            stageIndex={stageIndex}
            onChange={onChange}
          />
        </Flex>
      )}
    </ClauseStep>
  );
}

type AddFilterPopoverProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

function AddFilterPopover({
  query,
  stageIndex,
  onChange,
}: AddFilterPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  const handleSelect = (newFilter: Lib.Filterable) => {
    const newQuery = Lib.filter(query, stageIndex, newFilter);
    onChange(newQuery);
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <Button onClick={() => setIsOpened(!isOpened)}>{t`Add filter`}</Button>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          onSelect={handleSelect}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type ChangeFilterPopoverProps = {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  onChange: (query: Lib.Query) => void;
};

function ChangeFilterPopover({
  query,
  stageIndex,
  filter,
  onChange,
}: ChangeFilterPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);
  const filterInfo = Lib.displayInfo(query, stageIndex, filter);

  const handleSelect = (newFilter: Lib.Filterable) => {
    const newQuery = Lib.replaceClause(query, stageIndex, filter, newFilter);
    onChange(newQuery);
    setIsOpened(false);
  };

  const handleRemove = () => {
    const newQuery = Lib.removeClause(query, stageIndex, filter);
    onChange(newQuery);
  };

  return (
    <Popover opened={isOpened}>
      <Popover.Target>
        <FilterPill
          onClick={() => setIsOpened(!isOpened)}
          onRemoveClick={handleRemove}
        >
          {filterInfo.displayName}
        </FilterPill>
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
