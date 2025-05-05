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

// A value for a list of fields can be remapped if it's 1 unique field or
// if all the fields are the same PK or FKs targeting the same PK.
export function shouldRemap(fields: Field[]) {
  const targetOrFieldIds = fields.map(
    (field) => field.fk_target_field_id ?? field.id,
  );
  const uniqueFieldIds = new Set(targetOrFieldIds);
  return uniqueFieldIds.size === 1;
}
