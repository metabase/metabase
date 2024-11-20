import { t } from "ttag";

import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ClauseStep } from "metabase/querying/segments/components/SegmentEditor/ClauseStep";
import { Flex, Popover } from "metabase/ui";
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
      <Flex>
        {filters.map((filter, filterIndex) => (
          <FilterPopover
            key={filterIndex}
            query={query}
            stageIndex={stageIndex}
            filter={filter}
            onChange={onChange}
          />
        ))}
      </Flex>
    </ClauseStep>
  );
}

type FilterPopoverProps = {
  query: Lib.Query | undefined;
  stageIndex: number;
  filter: Lib.FilterClause;
  onChange: (query: Lib.Query) => void;
};

function FilterPopover({
  query,
  stageIndex,
  filter,
  onChange,
}: FilterPopoverProps) {
  if (!query) {
    return null;
  }

  const filterInfo = Lib.displayInfo(query, stageIndex, filter);

  const handleSelect = (newFilter: Lib.Filterable) => {
    const newQuery = Lib.filter(query, stageIndex, newFilter);
    onChange(newQuery);
  };

  return (
    <Popover>
      <Popover.Target>
        <FilterPill>{filterInfo.displayName}</FilterPill>
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
