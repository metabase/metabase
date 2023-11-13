import { TextInput, Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";
import { FilterPicker } from "metabase/common/components/FilterPicker";
import { Icon } from "metabase/core/components/Icon";

export interface FilterSelectProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (newFilter: Lib.ExpressionClause) => void;
}

export function FilterSelect({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: FilterSelectProps) {
  return (
    <Popover>
      <Popover.Target>
        <TextInput readOnly rightSection={<Icon name="chevrondown" />} />
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          legacyQuery={1 as any}
          onSelect={onChange as any}
          onSelectLegacy={1 as any}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
