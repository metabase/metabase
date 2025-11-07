import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Box, Icon } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { DatasetColumn } from "metabase-types/api";

import S from "./EditTableDataGrid.module.css";

type Props = {
  sortDirection?: Lib.OrderByDirection;
  column: DatasetColumn;
  onColumnSort?: (column: DatasetColumn) => void;
};

export function getTableEditingHeaderTemplate({
  sortDirection,
  column,
  onColumnSort,
}: Props) {
  return function TableEditingHeader() {
    return (
      <Box
        className={S.headerCellContainer}
        onClick={() => {
          onColumnSort?.(column);
        }}
      >
        <Ellipsified>{column.display_name}</Ellipsified>
        {sortDirection != null ? (
          <Icon
            className={S.sortIndicator}
            data-testid="header-sort-indicator"
            name={sortDirection === "asc" ? "chevronup" : "chevrondown"}
            size={10}
          />
        ) : null}
      </Box>
    );
  };
}
