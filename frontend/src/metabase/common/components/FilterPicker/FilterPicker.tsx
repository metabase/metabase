import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import { QueryColumnPicker } from "../QueryColumnPicker";

export interface FilterPickerProps {
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.FilterClause;
  onSelect: (filter: Lib.FilterClause) => void;
  onClose?: () => void;
}

export function FilterPicker({ query, stageIndex, filter }: FilterPickerProps) {
  const [column, setColumn] = useState<Lib.ColumnMetadata | null>(
    getInitialColumn(query, stageIndex, filter),
  );

  const columnGroups = useMemo(() => {
    const columns = Lib.filterableColumns(query, stageIndex);
    return Lib.groupColumns(columns);
  }, [query, stageIndex]);

  const checkColumnSelected = () => false;

  if (column) {
    return <div>✨ Filter editor ✨</div>;
  }

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

function getInitialColumn(
  query: Lib.Query,
  stageIndex: number,
  filter?: Lib.FilterClause,
) {
  if (filter) {
    const {
      args: [maybeColumn],
    } = Lib.expressionParts(query, stageIndex, filter);

    return Lib.isColumnMetadata(maybeColumn) ? maybeColumn : null;
  }

  return null;
}
