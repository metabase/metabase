import { t } from "ttag";

import type { Dataset } from "metabase-types/api";

export function getErrorMessage(data: Dataset) {
  const error = typeof data.error === "string" ? data.error : data.error?.data;

  if (data.error_type === "invalid-query") {
    return t`Something went wrong fetching the data for this field. This could mean something is wrong with the field settings, like a cast that is not supported for the underlying data type. Please check your settings and try again.`;
  }

  if (data.error_type === "missing-required-permissions") {
    return t`You do not have permission to preview this field's data.`;
  }

  return error ?? t`Something went wrong`;
}
