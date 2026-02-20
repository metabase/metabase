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
    case "missing-column":
      return t`This data source does not have some of the columns that the original data source has.`;
    case "column-type-mismatch":
      return t`This data source has columns with different data types than the original data source.`;
    case "missing-primary-key":
      return t`This data source does not have a primary key that the original data source has.`;
    case "extra-primary-key":
      return t`This data source has a primary key that the original data source does not have.`;
    case "missing-foreign-key":
      return t`This data source does not have a foreign key that the original data source has.`;
    case "foreign-key-mismatch":
      return t`This data source has a foreign key that references a different primary key than the original foreign key.`;
  }
}

export function getColumnErrorMessage(error: ReplaceSourceErrorType): string {
  switch (error) {
    case "same-source":
      return t`The original and new data sources are the same.`;
    case "cycle-detected":
      return t`A cycle was detected.`;
    case "database-mismatch":
      return t`The original and new data sources are in different databases.`;
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
  }
}
