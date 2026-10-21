import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useSetting } from "metabase/settings";
import { TimezoneIndicator } from "metabase/transforms/components/TimezoneIndicator";
import {
  getRunDurationMs,
  parseTimestampWithTimezone,
} from "metabase/transforms/utils";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Box,
  Card,
  Ellipsified,
  Group,
  SortableHeaderPill,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatDurationLong } from "metabase/utils/formatting";
import type {
  TransformTestRunId,
  TransformTestRunWithUser,
} from "metabase-types/api";

import { formatTestRunStatus, isFailedTestRunStatus } from "../../../utils";

type TransformTestRunTableProps = {
  runs: TransformTestRunWithUser[];
  hasFilters: boolean;
  onSelect: (runId: TransformTestRunId) => void;
};

export function TransformTestRunTable({
  runs,
  hasFilters,
  onSelect,
}: TransformTestRunTableProps) {
  const systemTimezone = useSetting("system-timezone");

  const instance = useTreeTableInstance({
    data: runs,
    columns: getColumns(systemTimezone),
    getNodeId: (run) => String(run.id),
  });

  return (
    <Card withBorder p={0}>
      <TreeTable
        instance={instance}
        emptyState={
          <ListEmptyState
            label={hasFilters ? t`No runs found` : t`No runs yet`}
          />
        }
        ariaLabel={t`Test runs`}
        onRowClick={(row) => onSelect(row.original.id)}
      />
    </Card>
  );
}

function getColumns(
  systemTimezone: string | undefined,
): TreeTableColumnDef<TransformTestRunWithUser>[] {
  const formatTime = (time: string | null) =>
    time != null
      ? parseTimestampWithTimezone(time, systemTimezone).format("lll")
      : EMPTY_CELL_PLACEHOLDER;

  return [
    {
      id: "start-time",
      header: () => <TimeHeader name={t`Started at`} />,
      width: "auto",
      accessorFn: (run) => formatTime(run.start_time),
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "end-time",
      header: () => <TimeHeader name={t`Ended at`} />,
      width: "auto",
      accessorFn: (run) => formatTime(run.end_time),
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "duration",
      header: t`Duration`,
      width: 120,
      accessorFn: (run) => getRunDurationMs(run),
      cell: ({ getValue }) => {
        const durationMs = getValue<number | null>();
        return durationMs != null
          ? formatDurationLong(durationMs)
          : EMPTY_CELL_PLACEHOLDER;
      },
    },
    {
      id: "status",
      header: t`Status`,
      width: 120,
      accessorFn: (run) => formatTestRunStatus(run.status),
      cell: ({ row }) => (
        <Box
          c={
            isFailedTestRunStatus(row.original.status)
              ? "feedback-negative"
              : undefined
          }
        >
          {formatTestRunStatus(row.original.status)}
        </Box>
      ),
    },
    {
      id: "run-by",
      header: t`Run by`,
      width: "auto",
      accessorFn: (run) =>
        run.initiated_by_user?.common_name ?? EMPTY_CELL_PLACEHOLDER,
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
  ];
}

function TimeHeader({ name }: { name: string }) {
  return (
    <Group gap="xxs" wrap="nowrap">
      <SortableHeaderPill name={name} />
      <TimezoneIndicator />
    </Group>
  );
}
