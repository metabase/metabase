import { useInterval } from "@mantine/hooks";
import type { Row, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { dayjs } from "metabase/dayjs";
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
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { Job, Trigger } from "metabase-types/api";

const COLUMN_WIDTHS = [0.4, 0.3, 0.3];

/** One row per trigger; `jobKey` opens the trigger details of its job. */
type TriggerRow = Trigger & { id: string; jobKey: string };

type JobsTableProps = {
  isFetching: boolean;
  isLoading: boolean;
  jobs: Job[];
};

export const JobsTable = ({ isFetching, isLoading, jobs }: JobsTableProps) => {
  const navigate = useNavigate();

  const rows: TriggerRow[] = useMemo(
    () =>
      jobs.flatMap((job) =>
        job.triggers.map((trigger) => ({
          ...trigger,
          id: trigger.key,
          jobKey: job.key,
        })),
      ),
    [jobs],
  );
  // "in 5 minutes" has to keep moving without refetching: re-render the time
  // cells on a timer by rebuilding the columns with the current moment
  const [now, setNow] = useState(() => Date.now());
  const tick = useInterval(() => setNow(Date.now()), 30_000);
  useEffect(() => {
    tick.start();
    return tick.stop;
  }, [tick]);
  const columns = useMemo(() => getColumns(now), [now]);
  // soonest trigger first
  const [sorting, setSorting] = useState<SortingState>([
    { id: "next-fire-time", desc: false },
  ]);

  const handleRowActivate = useCallback(
    (row: Row<TriggerRow>) => {
      navigate(Urls.monitorJobTriggers(row.original.jobKey));
    },
    [navigate],
  );

  const treeTableInstance = useTreeTableInstance<TriggerRow>({
    data: rows,
    columns,
    getNodeId: (row) => row.id,
    sorting,
    onSortingChange: setSorting,
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
            ariaLabel={t`Scheduled jobs`}
            emptyState={<MonitorEmptyState label={t`No results`} />}
            getRowProps={() => ({ "data-testid": "job" })}
            onRowClick={handleRowActivate}
          />
        </>
      )}
    </MonitorTableCard>
  );
};

/**
 * `metabase.task.sync-and-analyze.trigger.5` reads as `sync-and-analyze.5`: the
 * shared prefix and the `.trigger` segment say nothing about the trigger.
 */
function formatTriggerKey(key: string) {
  return key.replace(/^metabase\.task\./, "").replace(/\.trigger(?=\.|$)/, "");
}

function getColumns(now: number): TreeTableColumnDef<TriggerRow>[] {
  return [
    {
      id: "key",
      header: t`Trigger`,
      width: "auto",
      minWidth: 200,
      maxAutoWidth: 320,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (row) => formatTriggerKey(row.key),
      cell: ({ row }) => (
        <Ellipsified tooltip={row.original.key}>
          {formatTriggerKey(row.original.key)}
        </Ellipsified>
      ),
    },
    {
      id: "next-fire-time",
      header: t`Next fire time`,
      width: "auto",
      minWidth: 150,
      enableSorting: true,
      sortDescFirst: false,
      accessorFn: (row) => row["next-fire-time"] ?? "",
      cell: ({ row }) => (
        <FireTime value={row.original["next-fire-time"]} now={now} upcoming />
      ),
    },
    {
      id: "previous-fire-time",
      header: t`Last fired`,
      width: "auto",
      minWidth: 150,
      enableSorting: true,
      sortDescFirst: true,
      accessorFn: (row) => row["previous-fire-time"] ?? "",
      cell: ({ row }) => (
        <FireTime
          value={row.original["previous-fire-time"]}
          now={now}
          emptyLabel={t`Never`}
        />
      ),
    },
  ];
}

/** "in an hour" / "3 hours ago"; the tooltip keeps the exact time. */
function FireTime({
  value,
  now,
  upcoming = false,
  emptyLabel = EMPTY_CELL_PLACEHOLDER,
}: {
  value: string | null;
  /** The moment to be relative to; changes on a timer so the text stays current. */
  now: number;
  /** A time that should be in the future reads "Due 5 minutes ago" once it has passed. */
  upcoming?: boolean;
  emptyLabel?: string;
}) {
  if (!value) {
    return emptyLabel;
  }
  const time = dayjs(value);
  const isOverdue = upcoming && !time.isAfter(now);
  const relative = time.from(now);
  return (
    <Ellipsified style={{ maxWidth: 180 }} alwaysShowTooltip tooltip={value}>
      {isOverdue ? t`Due ${relative}` : relative}
    </Ellipsified>
  );
}
