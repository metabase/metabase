import { createContext, useContext } from "react";

import type { TableActionFormParameter } from "metabase-enterprise/table-editing/api/types";
import type * as Lib from "metabase-lib";
import type { DatasetColumn } from "metabase-types/api";

import type { EditDataGridCellState } from "./use-edit-datagrid-cell-state";
import type { TableEditingCell } from "./use-table-editing-cell";

export type EditTableDataGridContextValue = {
  columnsByName: Map<string, DatasetColumn>;
  parametersByName: Map<string, TableActionFormParameter>;
  sortDirectionsByName: Map<string, Lib.OrderByDirection | undefined>;
  editingCell: TableEditingCell | null;
  getCellState: (
    columnId: string,
    rowIndex: number,
  ) => EditDataGridCellState | undefined;
  onColumnSort?: (column: DatasetColumn) => void;
  onCancelEditing: () => void;
  onValueUpdated: (value: string | null) => void;
};

const EditTableDataGridContext =
  createContext<EditTableDataGridContextValue | null>(null);

export const EditTableDataGridContextProvider =
  EditTableDataGridContext.Provider;

/** The grid state that the header and body cells read, which can change without changing their component identity. */
export function useEditTableDataGridContext(): EditTableDataGridContextValue {
  const context = useContext(EditTableDataGridContext);
  if (context == null) {
    throw new Error(
      "useEditTableDataGridContext must be used inside EditTableDataGridContextProvider",
    );
  }
  return context;
}
