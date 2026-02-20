import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { ReplaceSourceErrorType } from "metabase-types/api";

type ErrorsCellProps = {
  errors: ReplaceSourceErrorType[];
};

export function ErrorsCell({ errors }: ErrorsCellProps) {
  return <Ellipsified>{errors.map(getErrorMessage).join(" ")}</Ellipsified>;
}

function getErrorMessage(error: ReplaceSourceErrorType): string {
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
  }
}
