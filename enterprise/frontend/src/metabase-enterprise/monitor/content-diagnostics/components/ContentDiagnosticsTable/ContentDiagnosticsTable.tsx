import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  Card,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type { ContentDiagnosticsFinding } from "metabase-types/api";

import { DiagnosticsEmptyState } from "../DiagnosticsEmptyState";

import { COLUMN_WIDTHS, getColumns } from "./columns";

type ContentDiagnosticsTableProps = {
  findings: ContentDiagnosticsFinding[];
  isLoading?: boolean;
  onSelect?: (finding: ContentDiagnosticsFinding) => void;
};

export function ContentDiagnosticsTable({
  findings,
  isLoading = false,
  onSelect,
}: ContentDiagnosticsTableProps) {
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<ContentDiagnosticsFinding>) => onSelect?.(row.original),
    [onSelect],
  );

  const treeTableInstance = useTreeTableInstance<ContentDiagnosticsFinding>({
    data: findings,
    columns,
    getNodeId: (finding) => String(finding.id),
    onRowActivate: handleRowActivate,
  });

  return (
    <Card
      flex="0 1 auto"
      mih={0}
      p={0}
      withBorder
      data-testid="stale-content-list"
    >
      {isLoading ? (
        <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          emptyState={
            <DiagnosticsEmptyState label={t`No stale content found`} />
          }
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
  );
}
