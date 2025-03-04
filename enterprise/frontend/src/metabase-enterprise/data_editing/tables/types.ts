import type { RowValue } from "metabase-types/api";
import type { FieldId } from "metabase-types/api/field";

export interface UpdateTableCellRequest {
  fieldId: FieldId;
  rowId: number;
  newValue: RowValue;
}

export type UpdateTableCellResponse = void;

export type CellValueUpdateHandlerParameters = {
  columnId: FieldId;
  rowPK: number;
  newValue: RowValue;
};
