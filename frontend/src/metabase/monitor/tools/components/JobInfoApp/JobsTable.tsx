import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import { MonitorTableCard } from "metabase/monitor/components/MonitorTableCard";
import { useNavigate } from "metabase/router";
import {
  Ellipsified,
  LoadingOverlay,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Job } from "metabase-types/api";

const COLUMN_WIDTHS = [0.34, 0.33, 0.33];

type JobRow = Job & { id: string };

type JobsTableProps = {
  isFetching: boolean;
  isLoading: boolean;
  jobs: Job[];
};

export const JobsTable = ({ isFetching, isLoading, jobs }: JobsTableProps) => {
  const navigate = useNavigate();

  const rows: JobRow[] = useMemo(
    () => jobs.map((job) => ({ ...job, id: job.key })),
    [jobs],
  );
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<JobRow>) => {
      navigate(Urls.monitorJobTriggers(row.original.key));
    },
    [navigate],
  );

  const treeTableInstance = useTreeTableInstance<JobRow>({
    data: rows,
    columns,
    getNodeId: (job) => job.id,
    onRowActivate: handleRowActivate,
  });

  return (
    <MonitorTableCard aria-busy={isFetching} data-testid="jobs-table">
      {isLoading ? (
        <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
      ) : (
        <>
          <LoadingOverlay visible={isFetching} data-testid="loading-overlay" />
          <TreeTable
            instance={treeTableInstance}
            hierarchical={false}
            ariaLabel={t`Jobs`}
            emptyState={<MonitorEmptyState label={t`No results`} />}
            getRowProps={() => ({ "data-testid": "job" })}
            onRowClick={handleRowActivate}
          />
        </>
      )}
    </MonitorTableCard>
  );
};

function getColumns(): TreeTableColumnDef<JobRow>[] {
  return [
    {
      id: "key",
      header: t`Key`,
      width: "auto",
      minWidth: 200,
      maxAutoWidth: 300,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (job) => job.key,
      cell: ({ row }) => <Ellipsified>{row.original.key}</Ellipsified>,
    },
    {
      id: "class",
      header: t`Class`,
      width: "auto",
      minWidth: 200,
      maxAutoWidth: 350,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (job) => job.class,
      cell: ({ row }) => <Ellipsified>{row.original.class}</Ellipsified>,
    },
    {
      id: "description",
      header: t`Description`,
      width: "auto",
      minWidth: 200,
      maxAutoWidth: 350,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (job) => job.description,
      cell: ({ row }) => <Ellipsified>{row.original.description}</Ellipsified>,
    },
  ];
}
