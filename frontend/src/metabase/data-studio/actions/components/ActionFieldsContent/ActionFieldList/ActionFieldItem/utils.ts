import { t } from "ttag";

import { getFieldTypes } from "metabase/actions/constants";
import type { FieldSettings, FieldType, IconName } from "metabase-types/api";

export function getFieldIcon(fieldType: FieldType): IconName {
  switch (fieldType) {
    case "number":
      return "int";
    case "date":
      return "calendar";
    default:
      return "string";
  }
}

export function getFieldSummary({ fieldType, required }: FieldSettings) {
  const typeName =
    getFieldTypes().find((option) => option.value === fieldType)?.name ??
    t`Text`;
  return required ? t`${typeName} · Required` : t`${typeName} · Optional`;
}
