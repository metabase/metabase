import { useMemo } from "react";
import { t } from "ttag";
import { Popover, TextInput } from "metabase/ui";
import * as Lib from "metabase-lib";
import { Icon } from "metabase/core/components/Icon";
import { FilterPicker } from "metabase/common/components/FilterPicker";

export interface FilterSelectProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (newFilter: Lib.ExpressionClause | Lib.SegmentMetadata) => void;
}

export function FilterSelect({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: FilterSelectProps) {
  const filterInfo = useMemo(() => {
    return filter && Lib.displayInfo(query, stageIndex, filter);
  }, [query, stageIndex, filter]);

  return (
    <Popover>
      <Popover.Target>
        <TextInput
          value={filterInfo ? filterInfo.displayName : t`All time`}
          readOnly
          rightSection={<Icon name="chevrondown" />}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          filter={filter}
          onSelect={onChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
