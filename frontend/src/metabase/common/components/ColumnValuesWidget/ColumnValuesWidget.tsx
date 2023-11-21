import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import { useLegacyField } from "metabase/common/hooks/use-legacy-field";
import type * as Lib from "metabase-lib";

export interface ColumnValuesWidgetProps<T> {
  value: T[];
  column: Lib.ColumnMetadata;
  hasMultipleValues?: boolean;
  disablePKRemappingForSearch?: boolean;
  autoFocus?: boolean;
  minWidth?: string;
  maxWidth?: string;
  onChange: (value: T[]) => void;
}

export function ColumnValuesWidget<T extends string | number>({
  value,
  column,
  hasMultipleValues,
  disablePKRemappingForSearch,
  autoFocus,
  minWidth,
  maxWidth,
  onChange,
}: ColumnValuesWidgetProps<T>) {
  const field = useLegacyField(column);
  return (
    <FieldValuesWidget
      fields={field ? [field] : []}
      className="input"
      value={value}
      containerWidth="100%"
      minWidth={minWidth}
      maxWidth={maxWidth}
      onChange={onChange}
      disablePKRemappingForSearch={disablePKRemappingForSearch}
      autoFocus={autoFocus}
      multi={hasMultipleValues}
      disableSearch={!hasMultipleValues}
    />
  );
}
