import {
  FIELD_DATA_SENSITIVITY_TYPES,
  type FieldDataSensitivity,
} from "metabase-types/api";

export function isFieldDataSensitivity(
  value: string,
): value is FieldDataSensitivity {
  return FIELD_DATA_SENSITIVITY_TYPES.some((type) => type === value);
}
