import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import { QueryColumnPicker } from "../QueryColumnPicker";

export interface FilterPickerProps {
  query: Lib.Query;
  stageIndex: number;
  onSelect: (filter: Lib.FilterClause) => void;
  onClose?: () => void;
}

export function FilterPicker({
  query,
  stageIndex,
  onClose,
}: FilterPickerProps) {
  const [, setColumn] = useState<Lib.ColumnMetadata | null>(null);

  const columnGroups = useMemo(() => {
    const columns = Lib.filterableColumns(query, stageIndex);
    return Lib.groupColumns(columns);
  }, [query, stageIndex]);

  const checkColumnSelected = () => false;

  return (
    <QueryColumnPicker
      query={query}
      stageIndex={stageIndex}
      columnGroups={columnGroups}
      color="filter"
      checkIsColumnSelected={checkColumnSelected}
      onSelect={setColumn}
      onClose={onClose}
    />
  );
}
