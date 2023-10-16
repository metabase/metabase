import { useMemo } from "react";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/metadata/Metadata";

interface ColumnValuesWidgetProps<T> {
  value: T[];
  column: Lib.ColumnMetadata;
  metadata: Metadata;
  canHaveManyValues?: boolean;
  onChange: (value: T[]) => void;
}

export function ColumnValuesWidget<T extends string | number>({
  value,
  column,
  metadata,
  canHaveManyValues,
  onChange,
}: ColumnValuesWidgetProps<T>) {
  const fields = useMemo(() => {
    const fieldId = Lib._fieldId(column);
    const field = metadata.field(fieldId);
    return field ? [field] : [];
  }, [column, metadata]);

  return (
    <FieldValuesWidget
      fields={fields}
      className="input"
      value={value}
      minWidth={"300px"}
      onChange={onChange}
      disablePKRemappingForSearch
      autoFocus
      multi={canHaveManyValues}
      disableSearch={!canHaveManyValues}
    />
  );
}
