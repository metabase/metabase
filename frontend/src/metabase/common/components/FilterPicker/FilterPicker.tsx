import { useMemo, useState } from "react";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import { QueryColumnPicker } from "../QueryColumnPicker";
import { FilterEditor } from "./FilterEditor";

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

  return (
    <Box miw={MIN_WIDTH} maw={MAX_WIDTH}>
      {column ? (
        <FilterEditor
          query={query}
          stageIndex={stageIndex}
          column={column}
          filter={filter}
          onChange={onSelect}
          onBack={() => setColumn(undefined)}
        />
      ) : (
        <QueryColumnPicker
          query={query}
          stageIndex={stageIndex}
          columnGroups={columnGroups}
          color="filter"
          checkIsColumnSelected={checkColumnSelected}
          onSelect={setColumn}
        />
      )}
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
