import { t } from "ttag";

import type {
  ReplaceSourceColumnErrorType,
  ReplaceSourceEntry,
  ReplaceSourceErrorType,
} from "metabase-types/api";

export function isSameEntity(
  entry1: ReplaceSourceEntry,
  entry2: ReplaceSourceEntry,
): boolean {
  return entry1.id === entry2.id && entry1.type === entry2.type;
}

export function getGenericErrorMessage(): string {
  return t`This data source isn't compatible.`;
}

export function getSourceErrorMessage(
  error: ReplaceSourceErrorType,
): string | undefined {
  switch (error) {
    case "incompatible-implicit-joins":
      return t`The original table can't be referenced by a foreign key by another table.`;
    default:
      return undefined;
  }
}

export function getTargetErrorMessage(
  error: ReplaceSourceErrorType,
): string | undefined {
  switch (error) {
    case "database-mismatch":
      return t`The replacement data source is in a different database than the original data source.`;
    case "cycle-detected":
      return t`The replacement data source can't be based on the original data source.`;
    default:
      return undefined;
  }
}

export function getColumnErrorMessage(
  error: ReplaceSourceColumnErrorType,
): string {
  switch (error) {
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
