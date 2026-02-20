import { t } from "ttag";

import type { ReplaceSourceErrorType } from "metabase-types/api";

export function getErrorLabel(error: ReplaceSourceErrorType): string {
  switch (error) {
    case "missing-column":
      return t`Column not found`;
    case "column-type-mismatch":
      return t`Column type mismatch`;
    case "missing-primary-key":
      return t`Primary key not found`;
    case "extra-primary-key":
      return t`Extra primary key`;
    case "missing-foreign-key":
      return t`Foreign key not found`;
    case "foreign-key-mismatch":
      return t`Foreign key mismatch`;
  }
}
