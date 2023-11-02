import { useMemo } from "react";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import * as Lib from "metabase-lib";

interface ColumnValuesWidgetProps<T> {
  value: T[];
  column: Lib.ColumnMetadata;
  canHaveManyValues?: boolean;
  onChange: (value: T[]) => void;
}

export function ColumnValuesWidget<T extends string | number>({
  value,
  column,
  canHaveManyValues,
  onChange,
}: ColumnValuesWidgetProps<T>) {
  const metadata = useSelector(getMetadata);

  const fields = useMemo(() => {
    const fieldId = Lib._fieldId(column);
    const tableId = Lib._cardOrTableId(column);
    const field = metadata.field(fieldId, tableId);
    return field ? [field] : [];
  }, [column, metadata]);

  return (
    <FieldValuesWidget
      fields={fields}
      className="input"
      value={value}
      minWidth="300px"
      onChange={onChange}
      disablePKRemappingForSearch
      autoFocus
      multi={canHaveManyValues}
      disableSearch={!canHaveManyValues}
    />
  );
}
