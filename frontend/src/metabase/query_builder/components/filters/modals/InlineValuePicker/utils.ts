import { isString } from "metabase-lib/lib/types/utils/isa";
import type Field from "metabase-lib/lib/metadata/Field";
import type Filter from "metabase-lib/lib/queries/structured/Filter";

const fieldWidth = {
  small: "11rem",
  medium: "20rem",
  full: "100%",
};

export const getFieldWidth = (field: Field, filter: Filter) => {
  const fullWidthField = ["=", "!=", "between"].includes(filter.operatorName());

  if (fullWidthField) {
    return fieldWidth.full;
  }

  if (isString(field)) {
    return fieldWidth.medium;
  }

  return fieldWidth.small;
};
