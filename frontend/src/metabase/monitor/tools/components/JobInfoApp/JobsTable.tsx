import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { MonitorEmptyState } from "metabase/monitor/components/MonitorEmptyState";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  Card,
  Ellipsified,
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
  isLoading: boolean;
  jobs: Job[];
};

export const JobsTable = ({ isLoading, jobs }: JobsTableProps) => {
  const dispatch = useDispatch();

  const rows: JobRow[] = useMemo(
    () => jobs.map((job) => ({ ...job, id: job.key })),
    [jobs],
  );
  const columns = useMemo(() => getColumns(), []);

  const handleRowActivate = useCallback(
    (row: Row<JobRow>) => {
      dispatch(push(Urls.monitorJobTriggers(row.original.key)));
    },
    [dispatch],
  );

  const treeTableInstance = useTreeTableInstance<JobRow>({
    data: rows,
    columns,
    getNodeId: (job) => job.id,
    onRowActivate: handleRowActivate,
  });

  return (
    <Card flex="0 1 auto" mih={0} p={0} withBorder data-testid="jobs-table">
      {isLoading ? (
        <TreeTableSkeleton columnWidths={COLUMN_WIDTHS} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          hierarchical={false}
          ariaLabel={t`Jobs`}
          emptyState={<MonitorEmptyState label={t`No results`} />}
          getRowProps={() => ({ "data-testid": "job" })}
          onRowClick={handleRowActivate}
        />
      )}
    </Card>
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
