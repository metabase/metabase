import type { HeaderContext } from "@tanstack/react-table";

import { Box, Ellipsified, Icon } from "metabase/ui";
import type { RowValue, RowValues } from "metabase-types/api";

import S from "./EditTableDataGrid.module.css";
import { useEditTableDataGridContext } from "./EditTableDataGridContext";

type EditTableDataGridHeaderCellProps = HeaderContext<RowValues, RowValue>;

export function EditTableDataGridHeaderCell({
  column,
}: EditTableDataGridHeaderCellProps) {
  const { columnsByName, sortDirectionsByName, onColumnSort } =
    useEditTableDataGridContext();
  const datasetColumn = columnsByName.get(column.id);

  if (datasetColumn == null) {
    return null;
  }

  const sortDirection = sortDirectionsByName.get(column.id);

  return (
    <Box
      className={S.headerCellContainer}
      onClick={() => onColumnSort?.(datasetColumn)}
    >
      <Ellipsified>{datasetColumn.display_name}</Ellipsified>
      {sortDirection != null && (
        <Icon
          className={S.sortIndicator}
          data-testid="header-sort-indicator"
          name={sortDirection === "asc" ? "chevronup" : "chevrondown"}
          size={10}
        />
      )}
    </Box>
  );
}
