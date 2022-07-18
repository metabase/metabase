import Field from "metabase-lib/lib/metadata/Field";
import { FieldPicker } from "./types";

export const getFieldPickerType = (field: Field): FieldPicker => {
  if (field.isBoolean()) {
    return "boolean";
  } else if (field.isDate() && !field.isTime()) {
    return "date";
  } else if (field.has_field_values === "list") {
    return "category";
  } else if (
    field.isNumeric() ||
    field.isPK() ||
    field.isFK() ||
    field.isString()
  ) {
    return "value";
  }

  return "other";
};
