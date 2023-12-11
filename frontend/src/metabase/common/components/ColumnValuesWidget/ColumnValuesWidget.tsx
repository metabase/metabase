import { useMemo } from "react";
import * as Lib from "metabase-lib";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import type { LayoutRendererArgs } from "metabase/components/TokenField/TokenField";
import LegacyDimension from "metabase-lib/Dimension";

export interface ColumnValuesWidgetProps<T> {
  value: T[];
  column: Lib.ColumnMetadata;
  hasMultipleValues?: boolean;
  disablePKRemappingForSearch?: boolean;
  expand?: boolean;
  disableList?: boolean;
  autoFocus?: boolean;
  minWidth?: string;
  maxWidth?: string;
  onChange: (value: T[]) => void;
  layoutRenderer?: (args: LayoutRendererArgs) => JSX.Element;
}

export function ColumnValuesWidget<T extends string | number>({
  value,
  column,
  hasMultipleValues,
  disablePKRemappingForSearch,
  expand,
  disableList,
  autoFocus,
  minWidth,
  maxWidth,
  onChange,
  layoutRenderer,
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
      disablePKRemappingForSearch={disablePKRemappingForSearch}
      expand={expand}
      autoFocus={autoFocus}
      disableList={disableList}
      multi={hasMultipleValues}
      disableSearch={!hasMultipleValues}
      layoutRenderer={layoutRenderer}
    />
  );
}
