import { t } from "ttag";

import type { ReplaceSourceErrorType } from "metabase-types/api";

export function getErrorLabel(error: ReplaceSourceErrorType): string {
  switch (error) {
    case "missing-column":
      return t`No matching column.`;
    case "column-type-mismatch":
      return t`Different column type.`;
    case "missing-primary-key":
      return t`No matching primary key.`;
    case "extra-primary-key":
      return t`Extra primary key.`;
    case "missing-foreign-key":
      return t`No matching foreign key.`;
    case "foreign-key-mismatch":
      return t`Different foreign key target.`;
  }
}

export function getErrorListLabel(errors: ReplaceSourceErrorType[]): string {
  return errors.map(getErrorLabel).join(", ");
}
