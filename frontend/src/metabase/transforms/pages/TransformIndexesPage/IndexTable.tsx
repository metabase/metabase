import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  ActionIcon,
  Badge,
  Box,
  Card,
  Code,
  Ellipsified,
  Group,
  Icon,
  Menu,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type {
  IndexColumnDirection,
  RequestableIndexes,
  TableId,
  TableIndexEntry,
  TableIndexRequestStatus,
  UserId,
} from "metabase-types/api";

import { DeleteIndexModal } from "./DeleteIndexModal";
import { EditIndexModal } from "./EditIndexModal";
import S from "./IndexTable.module.css";

// TreeTable rows need a stable `id`. A managed index uses its `request` id; a
// warehouse index Metabase doesn't manage carries none, so derive one from its
// observed identity.
type IndexRow = TableIndexEntry & { id: string };

function getRowId(index: TableIndexEntry): string {
  if (index.request) {
    return String(index.request.id);
  }
  return `warehouse:${index.name ?? index.kind}:${index.key_columns.join(",")}`;
}

// Metabase only tracks a lifecycle (a `request`) for indexes it manages. An
// external index was created in the warehouse outside of Metabase.
function isManagedIndex(index: TableIndexEntry): boolean {
  return index.request != null;
}

// A request queued for deletion can no longer be edited or re-deleted -- the
// backend treats it as gone, so there are no actions to offer.
function isDeletionPending(index: TableIndexEntry): boolean {
  return index.request?.status === "deletion-pending";
}

const PENDING_STATUSES: TableIndexRequestStatus[] = [
  "create-pending",
  "update-pending",
  "deletion-pending",
];

// The warehouse only reflects an index request once the transform rebuilds its
// target: the run flips runnable requests to `running`, while pending requests
// are applied during a run already in flight. Either way the index is actively
// being applied.
function isIndexBeingApplied(
  index: TableIndexEntry,
  isTransformRunning: boolean,
): boolean {
  const status = index.request?.status;
  if (status == null) {
    return false;
  }
  return (
    status === "running" ||
    (isTransformRunning && PENDING_STATUSES.includes(status))
  );
}

function ApplyingIndicator() {
  return (
    <Tooltip label={t`This index is being applied.`}>
      <Box
        className={S.applyingDot}
        role="status"
        aria-label={t`Being applied`}
      />
    </Tooltip>
  );
}

// Three buckets: pending work (including the active run) is brand, a verified
// index is success, and a failed one is error.
const STATUS_COLORS = {
  "create-pending": "brand",
  "update-pending": "brand",
  "deletion-pending": "brand",
  running: "brand",
  succeeded: "success",
  failed: "error",
} as const satisfies Record<TableIndexRequestStatus, string>;

function getStatusLabel(status: TableIndexRequestStatus): string {
  switch (status) {
    case "create-pending":
      return t`Pending creation`;
    case "update-pending":
      return t`Pending update`;
    case "deletion-pending":
      return t`Pending deletion`;
    case "running":
      return t`Running`;
    case "succeeded":
      return t`Succeeded`;
    case "failed":
      return t`Failed`;
  }
}

// Pending states are applied only on the transform's next full rebuild, so each
// one explains what that run will do.
function getPendingTooltip(status: TableIndexRequestStatus): string | null {
  switch (status) {
    case "create-pending":
      return t`This index will be created the next time the transform runs.`;
    case "update-pending":
      return t`This index will be updated the next time the transform runs.`;
    case "deletion-pending":
      return t`This index will be deleted the next time the transform runs.`;
    default:
      return null;
  }
}

type IndexSourceCellProps = {
  index: TableIndexEntry;
  applicationName: string;
};

function IndexSourceCell({ index, applicationName }: IndexSourceCellProps) {
  if (isManagedIndex(index)) {
    return t`Managed`;
  }
  return (
    <Tooltip
      label={t`This index was created outside of ${applicationName} and isn't managed here.`}
    >
      <Box component="span" c="text-secondary">{t`External`}</Box>
    </Tooltip>
  );
}

function IndexStatusCell({ index }: { index: TableIndexEntry }) {
  const { request } = index;
  // External indexes have no Metabase lifecycle, so there's no status to show.
  if (!request) {
    return EMPTY_CELL_PLACEHOLDER;
  }

  const badge = (
    <Badge color={STATUS_COLORS[request.status]}>
      {getStatusLabel(request.status)}
    </Badge>
  );
  // A pending index exists only as a request -- it isn't applied to the
  // warehouse until the transform runs again.
  const pendingTooltip = getPendingTooltip(request.status);
  if (pendingTooltip) {
    return (
      <Group gap="xs" wrap="nowrap" w="fit-content">
        {badge}
        <Tooltip label={pendingTooltip}>
          <Icon name="info" c="text-secondary" />
        </Tooltip>
      </Group>
    );
  }
  if (request.status === "failed" && request.error_message) {
    return <Tooltip label={request.error_message}>{badge}</Tooltip>;
  }
  return badge;
}

// Directions are only known for managed indexes -- they live on the structured
// request's columns, not on the flat `key_columns` list. External (warehouse)
// indexes and kinds without per-column ordering (e.g. distkey) carry none.
function getColumnDirections(
  index: TableIndexEntry,
): Map<string, IndexColumnDirection> {
  const { structured } = index.request ?? {};
  if (!structured || !("columns" in structured)) {
    return new Map();
  }
  return new Map(
    structured.columns.flatMap((column) =>
      column.direction ? [[column.name, column.direction]] : [],
    ),
  );
}

const DIRECTION_ARROWS = {
  asc: "↑",
  desc: "↓",
} as const satisfies Record<IndexColumnDirection, string>;

function getDirectionLabel(direction: IndexColumnDirection): string {
  return direction === "asc" ? t`Ascending` : t`Descending`;
}

function IndexColumnsCell({ index }: { index: TableIndexEntry }) {
  const directions = getColumnDirections(index);
  return (
    <Group gap="xs" wrap="nowrap">
      {index.key_columns.map((name) => {
        const direction = directions.get(name);
        return (
          <Code key={name}>
            <Tooltip
              label={direction ? getDirectionLabel(direction) : undefined}
              disabled={!direction}
            >
              <Box>
                <span>{name}</span>
                {direction && (
                  <Box component="span" ml={2} c="text-secondary">
                    {direction && DIRECTION_ARROWS[direction]}
                  </Box>
                )}
              </Box>
            </Tooltip>
          </Code>
        );
      })}
    </Group>
  );
}

function IndexUserCell({ userName }: { userName: string | undefined }) {
  if (!userName) {
    return EMPTY_CELL_PLACEHOLDER;
  }
  return <Ellipsified>{userName}</Ellipsified>;
}

type IndexActionsCellProps = {
  onEdit: () => void;
  onDelete: () => void;
};

function IndexActionsCell({ onEdit, onDelete }: IndexActionsCellProps) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon size="sm" aria-label={t`Index actions`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Icon name="pencil" />} onClick={onEdit}>
          {t`Edit`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={onDelete}>
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

type GetColumnsOptions = {
  isTransformRunning: boolean;
  applicationName: string;
  readOnly: boolean;
  getUserName: (userId: UserId | null | undefined) => string | undefined;
  onEdit: (index: TableIndexEntry) => void;
  onDelete: (index: TableIndexEntry) => void;
};

function getColumns({
  isTransformRunning,
  applicationName,
  readOnly,
  getUserName,
  onEdit,
  onDelete,
}: GetColumnsOptions): TreeTableColumnDef<IndexRow>[] {
  const columns: TreeTableColumnDef<IndexRow>[] = [
    {
      id: "name",
      header: t`Name`,
      minWidth: "auto",
      maxAutoWidth: 320,
      accessorFn: (index) => index.name ?? "",
      cell: ({ row }) => (
        <Group gap="xs" wrap="nowrap">
          {row.original.name ? (
            <Ellipsified>{row.original.name}</Ellipsified>
          ) : (
            EMPTY_CELL_PLACEHOLDER
          )}
        </Group>
      ),
    },
    {
      id: "kind",
      header: t`Kind`,
      width: "auto",
      accessorFn: (index) => index.kind,
      cell: ({ row }) => row.original.kind,
    },
    {
      id: "columns",
      header: t`Columns`,
      minWidth: "auto",
      maxAutoWidth: 480,
      accessorFn: (index) => index.key_columns.join(", "),
      cell: ({ row }) => <IndexColumnsCell index={row.original} />,
    },
    {
      id: "source",
      header: t`Source`,
      width: "auto",
      accessorFn: (index) => (isManagedIndex(index) ? t`Managed` : t`External`),
      cell: ({ row }) => (
        <IndexSourceCell
          index={row.original}
          applicationName={applicationName}
        />
      ),
    },
    {
      id: "status",
      header: t`Status`,
      width: "auto",
      accessorFn: (index) => index.request?.status ?? "",
      cell: ({ row }) => (
        <Group gap="xs" wrap="nowrap">
          <IndexStatusCell index={row.original} />{" "}
          {isIndexBeingApplied(row.original, isTransformRunning) && (
            <ApplyingIndicator />
          )}
        </Group>
      ),
    },
    {
      id: "created_by",
      header: t`Created by`,
      minWidth: "auto",
      maxAutoWidth: 240,
      accessorFn: (index) => getUserName(index.request?.created_by) ?? "",
      cell: ({ row }) => (
        <IndexUserCell
          userName={getUserName(row.original.request?.created_by)}
        />
      ),
    },
    {
      id: "last_executed_at",
      header: t`Last run`,
      width: "auto",
      accessorFn: (index) => index.request?.last_executed_at ?? "",
      cell: ({ row }) =>
        row.original.request?.last_executed_at ? (
          <DateTime value={row.original.request.last_executed_at} />
        ) : (
          EMPTY_CELL_PLACEHOLDER
        ),
    },
  ];

  // Edit and delete act on the managed `request`, so they're only available to
  // writers and never on external indexes.
  if (!readOnly) {
    columns.push({
      id: "actions",
      header: "",
      width: "auto",
      cell: ({ row }) =>
        isManagedIndex(row.original) && !isDeletionPending(row.original) ? (
          <IndexActionsCell
            onEdit={() => onEdit(row.original)}
            onDelete={() => onDelete(row.original)}
          />
        ) : null,
    });
  }

  return columns;
}

type IndexAction = {
  type: "edit" | "delete";
  index: TableIndexEntry;
};

type IndexTableProps = {
  indexes: TableIndexEntry[];
  isTransformRunning: boolean;
  tableId: TableId | null;
  requestableIndexes?: RequestableIndexes | null;
  readOnly?: boolean;
};

export function IndexTable({
  indexes,
  isTransformRunning,
  tableId,
  requestableIndexes,
  readOnly = false,
}: IndexTableProps) {
  const applicationName = useSelector(getApplicationName);
  const { data: usersData } = useListUsersQuery({});
  const [action, setAction] = useState<IndexAction>();

  const getUserName = useCallback(
    (userId: UserId | null | undefined) => {
      if (userId == null) {
        return undefined;
      }
      return usersData?.data.find((user) => user.id === userId)?.common_name;
    },
    [usersData],
  );

  const handleEdit = useCallback((index: TableIndexEntry) => {
    setAction({ type: "edit", index });
  }, []);
  const handleDelete = useCallback((index: TableIndexEntry) => {
    setAction({ type: "delete", index });
  }, []);
  const handleCloseAction = useCallback(() => setAction(undefined), []);

  const columns = useMemo(
    () =>
      getColumns({
        isTransformRunning,
        applicationName,
        readOnly,
        getUserName,
        onEdit: handleEdit,
        onDelete: handleDelete,
      }),
    [
      isTransformRunning,
      applicationName,
      readOnly,
      getUserName,
      handleEdit,
      handleDelete,
    ],
  );
  const data = useMemo<IndexRow[]>(
    () => indexes.map((index) => ({ ...index, id: getRowId(index) })),
    [indexes],
  );
  const instance = useTreeTableInstance<IndexRow>({
    data,
    columns,
    getNodeId: (row) => row.id,
  });

  return (
    <>
      <Card
        className={CS.overflowHidden}
        p={0}
        flex="0 1 auto"
        mih={0}
        shadow="none"
        withBorder
      >
        <TreeTable
          instance={instance}
          emptyState={
            <ListEmptyState label={t`No indexes defined for this transform.`} />
          }
          ariaLabel={t`Transform indexes`}
        />
      </Card>
      {action?.type === "edit" && (
        <EditIndexModal
          index={action.index}
          tableId={tableId}
          requestableIndexes={requestableIndexes}
          onClose={handleCloseAction}
        />
      )}
      {action?.type === "delete" && (
        <DeleteIndexModal index={action.index} onClose={handleCloseAction} />
      )}
    </>
  );
}
