import { t } from "ttag";

import type {
  ReplaceSourceColumnErrorType,
  ReplaceSourceErrorType,
} from "metabase-types/api";

export function getGenericErrorMessage(): string {
  return t`This data source isn't compatible.`;
}

export function getEntityErrorMessage(error: ReplaceSourceErrorType): string {
  switch (error) {
    case "same-source":
      return t`The data sources are the same.`;
    case "cycle-detected":
      return t`The replacement data source can't be based on the original data source.`;
    case "database-mismatch":
      return t`This data source is in a different database than the original data source.`;
    case "missing-column":
      return "This data source does not include all columns from the original data source.";
    case "column-type-mismatch":
      return "This data source includes columns with different data types than the original data source.";
    case "missing-primary-key":
      return "This data source does not have a primary key, while the original data source does.";
    case "extra-primary-key":
      return "This data source has a primary key, while the original data source does not.";
    case "missing-foreign-key":
      return "This data source does not have a foreign key, while the original data source does.";
    case "foreign-key-mismatch":
      return "This data source has a foreign key that references a different primary key than the original data source.";
  }
}

export function getColumnErrorMessage(
  error: ReplaceSourceColumnErrorType,
): string | null {
  switch (error) {
    case "missing-column":
      return null;
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
