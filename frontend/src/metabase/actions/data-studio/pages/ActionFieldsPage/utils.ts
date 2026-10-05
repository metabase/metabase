import { t } from "ttag";

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

function getFieldTypeName(fieldType: FieldType): string {
  switch (fieldType) {
    case "number":
      return t`Number`;
    case "date":
      return t`Date`;
    default:
      return t`Text`;
  }
}

export function getFieldSummary({ fieldType, required }: FieldSettings) {
  const typeName = getFieldTypeName(fieldType);
  return required ? t`${typeName} · Required` : t`${typeName} · Optional`;
}
