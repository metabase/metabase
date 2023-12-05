import type { ColumnValuesWidgetProps } from "../../ColumnValuesWidget";
import { ColumnValuesWidget } from "../../ColumnValuesWidget";
import { MIN_WIDTH, MAX_WIDTH } from "../constants";

type FilterValuesWidgetProps<T> = Omit<
  ColumnValuesWidgetProps<T>,
  "minWidth" | "maxWidth"
>;

export function FilterValuesWidget<T extends string | number>(
  props: FilterValuesWidgetProps<T>,
) {
  return (
    <ColumnValuesWidget
      {...props}
      minWidth={`${MIN_WIDTH}px`}
      maxWidth={`${MAX_WIDTH}px`}
    />
  );
}
