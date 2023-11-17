import type { ColumnValuesWidgetProps } from "../../ColumnValuesWidget";
import { ColumnValuesWidget as BaseColumnValuesWidget } from "../../ColumnValuesWidget";
import { MIN_WIDTH, MAX_WIDTH } from "../constants";

export function ColumnValuesWidget<T extends string | number>(
  props: Omit<ColumnValuesWidgetProps<T>, "minWidth" | "maxWidth">,
) {
  return (
    <BaseColumnValuesWidget
      {...props}
      minWidth={`${MIN_WIDTH}px`}
      maxWidth={`${MAX_WIDTH}px`}
    />
  );
}
