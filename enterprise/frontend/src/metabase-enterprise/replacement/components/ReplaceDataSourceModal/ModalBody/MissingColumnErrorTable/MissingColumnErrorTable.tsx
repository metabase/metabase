import { useMemo } from "react";

import { Stack, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { MissingColumnReplaceSourceError } from "metabase-types/api";

import { ErrorTableHeader } from "../ErrorTableHeader";

import type { MissingColumnReplaceSourceErrorItem } from "./types";
import { getColumns, getRows, getTitle } from "./utils";

type MissingColumnErrorTableProps = {
  errors: MissingColumnReplaceSourceError[];
};

export function MissingColumnErrorTable({
  errors,
}: MissingColumnErrorTableProps) {
  const title = getTitle(errors.length);
  const rows = useMemo(() => getRows(errors), [errors]);
  const columns = useMemo(() => getColumns(), []);

  const treeTableInstance =
    useTreeTableInstance<MissingColumnReplaceSourceErrorItem>({
      data: rows,
      columns,
      getNodeId: (error) => error.id,
    });

  return (
    <Stack>
      <ErrorTableHeader title={title} count={errors.length} />
      <TreeTable instance={treeTableInstance} />
    </Stack>
  );
}
