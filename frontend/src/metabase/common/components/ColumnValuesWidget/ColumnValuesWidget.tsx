import type { LayoutRendererArgs } from "metabase/components/TokenField/TokenField";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import { useLegacyField } from "metabase/common/hooks/use-legacy-field";
import type * as Lib from "metabase-lib";

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
      expand={expand}
      autoFocus={autoFocus}
      disableList={disableList}
      multi={hasMultipleValues}
      disableSearch={!hasMultipleValues}
      layoutRenderer={layoutRenderer}
    />
  );
}
