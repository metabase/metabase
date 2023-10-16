import { useMemo } from "react";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/metadata/Metadata";

interface FilterValuesWidgetProps {
  value: string[];
  column: Lib.ColumnMetadata;
  metadata: Metadata;
  canHaveManyValues: boolean;
  onChange: (value: string[]) => void;
}

export function FilterValuesWidget({
  value,
  column,
  metadata,
  canHaveManyValues,
  onChange,
}: FilterValuesWidgetProps) {
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
