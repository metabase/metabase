import type * as Lib from "metabase-lib";
import { DatePickerShortcuts } from "./DatePickerShortcuts";

export interface DatePickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  onChange: (clause: Lib.ExpressionClause) => void;
}

export const DatePicker = ({ column, onChange }: DatePickerProps) => {
  return (
    <DatePickerShortcuts
      column={column}
      onChange={onChange}
      onNavigate={() => undefined}
    />
  );
};
