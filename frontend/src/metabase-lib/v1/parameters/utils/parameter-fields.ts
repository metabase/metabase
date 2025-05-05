import type Field from "metabase-lib/v1/metadata/Field";
import type {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/v1/parameters/types";

export const isFieldFilterUiParameter = (
  parameter: UiParameter,
): parameter is FieldFilterUiParameter => {
  return "fields" in parameter && Array.isArray(parameter.fields);
};

export const hasFields = (parameter: UiParameter) => {
  return isFieldFilterUiParameter(parameter) && parameter.fields.length > 0;
};

export const getFields = (parameter: UiParameter): Field[] => {
  if (isFieldFilterUiParameter(parameter) && hasFields(parameter)) {
    return parameter.fields;
  } else {
    return [];
  }
};

export const getNonVirtualFields = (parameter: UiParameter) => {
  return getFields(parameter).filter((field) => !field.isVirtual());
};

/*
  A field value can be remapped in these cases:
  - there is 1 unique field
  - there are 2 unique fields, where one is a PK and another one is a FK targeting the PK
 */
export function canRemapValues(fields: Field[]) {
  const fieldOrTargetFieldIds = fields.map(
    (field) => field.fk_target_field_id ?? field.id,
  );
  const uniqueFieldIds = new Set(fieldOrTargetFieldIds);
  return uniqueFieldIds.size === 1;
}
