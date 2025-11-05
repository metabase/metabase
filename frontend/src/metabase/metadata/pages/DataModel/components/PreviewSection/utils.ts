import { t } from "ttag";

import type { Dataset, Field } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

export function getPreviewTypeData() {
  return [
    { label: t`Table`, value: "table" as const },
    { label: t`Detail`, value: "detail" as const },
    { label: t`Filtering`, value: "filtering" as const },
  ];
}

export function getDataErrorMessage(data: Dataset): string {
  const error = typeof data.error === "string" ? data.error : data.error?.data;

  if (data.error_type === "invalid-query") {
    return t`Something went wrong fetching the data for this field. This could mean something is wrong with the field settings, like a cast that is not supported for the underlying data type. Please check your settings and try again.`;
  }

  if (data.error_type === "missing-required-permissions") {
    return t`You do not have permission to preview this field's data.`;
  }

  return error ?? t`Something went wrong`;
}

export function is403Error(error: unknown): boolean {
  return isObject(error) && error.status === 403;
}

export function isFieldHidden(field: Field) {
  return (
    field.visibility_type === "sensitive" ||
    field.visibility_type === "details-only"
  );
}
