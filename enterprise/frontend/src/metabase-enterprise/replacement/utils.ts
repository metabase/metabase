import { t } from "ttag";

import type { ReplaceSourceErrorType } from "metabase-types/api";

export function getGenericErrorMessage(): string {
  return t`This data source is not compatible with the original data source.`;
}

export function getEntityErrorMessage(error: ReplaceSourceErrorType): string {
  switch (error) {
    case "same-source":
      return t`The data source are the same.`;
    case "cycle-detected":
      return t`A cycle was detected.`;
    case "database-mismatch":
      return t`This data source is in a different database than the original data source.`;
    default:
      return getGenericErrorMessage();
  }
}

export function getColumnErrorMessage(error: ReplaceSourceErrorType): string {
  switch (error) {
    case "missing-column":
      return t`Missing column.`;
    case "column-type-mismatch":
      return t`This column has a different data type than the original column.`;
    case "missing-primary-key":
      return t`This column is not a primary key, while the original column is.`;
    case "extra-primary-key":
      return t`This column is a primary key, while the original column is not.`;
    case "missing-foreign-key":
      return t`This column is not a foreign key, while the original column is.`;
    case "foreign-key-mismatch":
      return t`This foreign key references a different primary key than the original foreign key.`;
    default:
      return getGenericErrorMessage();
  }
}
