import { useMemo, useState } from "react";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import { QueryColumnPicker } from "../QueryColumnPicker";
import { BooleanFilterPicker } from "./BooleanFilterPicker";
import { NumberFilterPicker } from "./NumberFilterPicker";
import { StringFilterPicker } from "./StringFilterPicker";

export interface FilterPickerProps {
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;
  onSelect: (filter: Lib.FilterClause) => void;
  onClose?: () => void;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 410;

export function FilterPicker({
  query,
  stageIndex,
  filter,
  onSelect,
}: FilterPickerProps) {
  const [column, setColumn] = useState<Lib.ColumnMetadata | undefined>(
    getInitialColumn(query, stageIndex, filter),
  );

  const columnGroups = useMemo(() => {
    const columns = Lib.filterableColumns(query, stageIndex);
    return Lib.groupColumns(columns);
  }, [query, stageIndex]);

  const checkColumnSelected = () => false;

  const renderContent = () => {
    if (!column) {
      return (
        <QueryColumnPicker
          query={query}
          stageIndex={stageIndex}
          columnGroups={columnGroups}
          color="filter"
          checkIsColumnSelected={checkColumnSelected}
          onSelect={setColumn}
        />
      );
    }

    const FilterWidget = getFilterWidget(column);
    return (
      <FilterWidget
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={filter}
        onChange={onSelect}
        onBack={() => setColumn(undefined)}
      />
    );
  };

  return (
    <Box miw={MIN_WIDTH} maw={MAX_WIDTH}>
      {renderContent()}
    </Box>
  );
}

function getInitialColumn(
  query: Lib.Query,
  stageIndex: number,
  filter?: Lib.FilterClause,
) {
  return filter
    ? Lib.filterParts(query, stageIndex, filter)?.column
    : undefined;
}

const NotImplementedPicker = () => <div />;

function getFilterWidget(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return BooleanFilterPicker;
  }
  if (Lib.isDate(column)) {
    return NotImplementedPicker;
  }
  if (Lib.isNumber(column)) {
    return NumberFilterPicker;
  }
  if (Lib.isString(column)) {
    return StringFilterPicker;
  }
  return NotImplementedPicker;
}
