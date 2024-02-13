import { useMemo } from "react";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import * as Lib from "metabase-lib";
import LegacyDimension from "metabase-lib/Dimension";

export interface ColumnValuesWidgetProps<T> {
  value: T[];
  column: Lib.ColumnMetadata;
  hasMultipleValues?: boolean;
  minWidth?: string;
  maxWidth?: string;
  onChange: (value: T[]) => void;
}

export function ColumnValuesWidget<T extends string | number>({
  value,
  column,
  hasMultipleValues,
  minWidth,
  maxWidth,
  onChange,
}: ColumnValuesWidgetProps<T>) {
  const metadata = useSelector(getMetadata);

  const fields = useMemo(() => {
    const fieldId = Lib._fieldId(column);
    if (typeof fieldId === "number") {
      const tableId = Lib._cardOrTableId(column);
      const field = metadata.field(fieldId, tableId);
      return field ? [field] : [];
    }
    const fieldRef = Lib.legacyFieldRef(column);
    const dimension = LegacyDimension.parseMBQL(fieldRef, metadata);
    const field = dimension?.field?.();
    return field ? [field] : [];
  }, [column, metadata]);

  return (
    <FieldValuesWidget
      fields={fields}
      className="input"
      value={value}
      containerWidth="100%"
      minWidth={minWidth}
      maxWidth={maxWidth}
      onChange={onChange}
      disablePKRemappingForSearch
      autoFocus
      multi={hasMultipleValues}
      disableSearch={!hasMultipleValues}
    />
  );
}
