import type { ReplaceSourceError } from "metabase-types/api";

import { ColumnErrorTable } from "./ColumnErrorTable";
import { ColumnTypeMismatchErrorTable } from "./ColumnTypeMismatchErrorTable";
import { ForeignKeyMismatchErrorTable } from "./ForeignKeyMismatchErrorTable";

type ErrorTableProps = {
  error: ReplaceSourceError;
};

export function ErrorTable({ error }: ErrorTableProps) {
  switch (error.type) {
    case "missing-column":
    case "missing-primary-key":
    case "extra-primary-key":
    case "missing-foreign-key":
      return <ColumnErrorTable columns={error.columns} />;
    case "column-type-mismatch":
      return <ColumnTypeMismatchErrorTable error={error} />;
    case "foreign-key-mismatch":
      return <ForeignKeyMismatchErrorTable error={error} />;
  }
}
