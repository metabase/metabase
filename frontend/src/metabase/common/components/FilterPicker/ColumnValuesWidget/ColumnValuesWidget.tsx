import { useMemo } from "react";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import * as Lib from "metabase-lib";
import LegacyDimension from "metabase-lib/Dimension";

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
    if (fieldId) {
      const field = metadata.field(fieldId);
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
      minWidth="300px"
      onChange={onChange}
      disablePKRemappingForSearch
      autoFocus
      multi={canHaveManyValues}
      disableSearch={!canHaveManyValues}
    />
  );
}
