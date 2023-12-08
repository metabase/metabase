import type { ColumnValuesWidgetProps } from "metabase/common/components/ColumnValuesWidget";
import { ColumnValuesWidget } from "metabase/common/components/ColumnValuesWidget";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";

export function FilterValuePicker<T extends string | number>(
  props: ColumnValuesWidgetProps<T>,
) {
  return (
    <ColumnValuesWidget
      {...props}
      minWidth={`${MIN_WIDTH}px`}
      maxWidth={`${MAX_WIDTH}px`}
      hasMultipleValues
    />
  );
}
