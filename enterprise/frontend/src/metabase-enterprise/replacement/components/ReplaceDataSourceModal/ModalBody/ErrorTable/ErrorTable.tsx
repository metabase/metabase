import type { ReplaceSourceError } from "metabase-types/api";

import { ColumnCompareErrorTable } from "./ColumnCompareErrorTable";
import { ColumnErrorTable } from "./ColumnErrorTable";

type ErrorTableProps = {
  error: ReplaceSourceError;
};

export function ErrorTable({ error }: ErrorTableProps) {
  switch (error.type) {
    case "missing-column":
    case "missing-primary-key":
    case "extra-primary-key":
    case "missing-foreign-key":
    case "foreign-key-mismatch":
      return <ColumnErrorTable columns={error.columns} />;
    case "column-type-mismatch":
      return <ColumnCompareErrorTable columns={error.columns} />;
  }
}
