import type { ReplaceSourceError } from "metabase-types/api";

import { ColumnTypeMismatchErrorTable } from "./ColumnTypeMismatchErrorTable";
import { ExtraPrimaryKeyErrorTable } from "./ExtraPrimaryKeyErrorTable";
import { ForeignKeyMismatchErrorTable } from "./ForeignKeyMismatchErrorTable";
import { MissingColumnErrorTable } from "./MissingColumnErrorTable";
import { MissingForeignKeyErrorTable } from "./MissingForeignKeyErrorTable";
import { MissingPrimaryKeyErrorTable } from "./MissingPrimaryKeyErrorTable";

type ErrorTableProps = {
  error: ReplaceSourceError;
};

export function ErrorTable({ error }: ErrorTableProps) {
  if (error.type === "missing-column") {
    return <MissingColumnErrorTable error={error} />;
  }
  if (error.type === "column-type-mismatch") {
    return <ColumnTypeMismatchErrorTable error={error} />;
  }
  if (error.type === "missing-primary-key") {
    return <MissingPrimaryKeyErrorTable error={error} />;
  }
  if (error.type === "extra-primary-key") {
    return <ExtraPrimaryKeyErrorTable error={error} />;
  }
  if (error.type === "missing-foreign-key") {
    return <MissingForeignKeyErrorTable error={error} />;
  }
  if (error.type === "foreign-key-mismatch") {
    return <ForeignKeyMismatchErrorTable error={error} />;
  }
}
