import { EditingBodyCellBasicInput } from "./EditingBodyCellBasicInput";
import { EditingBodyCellCategorySelect } from "./EditingBodyCellCategorySelect";
import { EditingBodyCellDatetime } from "./EditingBodyCellDatetime";
import { EditingBodyCellFKSelect } from "./EditingBodyCellFKSelect";
import type { EditingBodyPrimitiveProps } from "./types";

export const EditingBodyCellConditional = (
  props: EditingBodyPrimitiveProps,
) => {
  const { datasetColumn: column } = props;

  if (
    column.semantic_type === "type/State" ||
    column.semantic_type === "type/Country" ||
    column.semantic_type === "type/Category"
  ) {
    return <EditingBodyCellCategorySelect {...props} />;
  }

  if (column.semantic_type === "type/FK") {
    return <EditingBodyCellFKSelect {...props} />;
  }

  if (
    column.effective_type === "type/Date" ||
    column.effective_type === "type/DateTime" ||
    column.effective_type === "type/DateTimeWithLocalTZ"
  ) {
    return <EditingBodyCellDatetime {...props} />;
  }

  return <EditingBodyCellBasicInput {...props} />;
};
