import { useMemo } from "react";

import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type {
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import type { ReplaceSourceErrorItem } from "./types";
import { getColumns, getRows } from "./utils";

type ErrorTableProps = {
  errors: ReplaceSourceError[];
  errorType: ReplaceSourceErrorType;
};

export function ErrorTable({ errors, errorType }: ErrorTableProps) {
  const rows = useMemo(() => getRows(errors, errorType), [errors, errorType]);
  const columns = useMemo(() => getColumns(errorType), [errorType]);

  const treeTableInstance = useTreeTableInstance<ReplaceSourceErrorItem>({
    data: rows,
    columns,
    getNodeId: (error) => error.id,
  });

  return (
    <Card p={0} shadow="none" withBorder>
      <TreeTable instance={treeTableInstance} />
    </Card>
  );
}
