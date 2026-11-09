import { useMemo } from "react";

import { QueryColumnPicker } from "metabase/querying/common/components/QueryColumnPicker";
import * as Lib from "metabase-lib";

type Props = {
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  onColumnClick?: (column: Lib.ColumnMetadata) => void;
};

const notSelected = () => false;

export function AvailableColumnsBrowser({
  query,
  stageIndex,
  availableColumns,
  onColumnClick,
}: Props) {
  const columnGroups = useMemo(
    () => Lib.groupColumns(availableColumns),
    [availableColumns],
  );

  return (
    <QueryColumnPicker
      query={query}
      stageIndex={stageIndex}
      columnGroups={columnGroups}
      // The editor keeps focus: this lists what can be referenced rather than
      // tracking a selection.
      hasInitialFocus={false}
      checkIsColumnSelected={notSelected}
      width="100%"
      onSelect={(column) => onColumnClick?.(column)}
      data-testid="expression-editor-columns-browser"
    />
  );
}
