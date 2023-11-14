import { useMemo, useState } from "react";
import { t } from "ttag";
import { Button, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import { Icon } from "metabase/core/components/Icon";
import { FilterPickerBody } from "metabase/common/components/FilterPicker";

export interface TemporalFilterSelectProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (newFilter: Lib.ExpressionClause) => void;
}

export function TemporalFilterSelect({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: TemporalFilterSelectProps) {
  const [isOpened, setIsOpened] = useState(false);

  const filterInfo = useMemo(() => {
    return filter && Lib.displayInfo(query, stageIndex, filter);
  }, [query, stageIndex, filter]);

  const handleButtonClick = () => {
    setIsOpened(!isOpened);
  };

  const handleFilterChange = (newFilter: Lib.ExpressionClause) => {
    onChange(newFilter);
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} onChange={setIsOpened}>
      <Popover.Target>
        <Button
          rightIcon={<Icon name="chevrondown" />}
          onClick={handleButtonClick}
        >
          {filterInfo ? filterInfo.displayName : t`All time`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPickerBody
          query={query}
          stageIndex={stageIndex}
          column={column}
          filter={filter}
          onChange={handleFilterChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
