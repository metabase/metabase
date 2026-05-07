import type { Row, SortingState, Updater } from "@tanstack/react-table";
import dayjs from "dayjs";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Badge,
  Card,
  Checkbox,
  Ellipsified,
  Flex,
  Icon,
  Text,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  AdminNotification,
  NotificationChannelType,
  NotificationId,
  NotificationRunSummary,
} from "metabase-types/api";

import { getChannelIconName, getChannelLabel } from "./utils";

type Props = {
  notifications: AdminNotification[];
  error: unknown;
  isLoading: boolean;
  selectedIds: NotificationId[];
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  onToggleRow: (id: NotificationId) => void;
  onToggleAll: () => void;
  onRowClick?: (id: NotificationId) => void;
};

const getNodeId = (notification: AdminNotification) => String(notification.id);

type ChannelSummary = {
  channel: NotificationChannelType;
  count: number;
};

const summarizeChannels = (
  notification: AdminNotification,
): ChannelSummary[] => {
  const handlers = notification.handlers ?? [];
  const map = new Map<NotificationChannelType, number>();
  for (const handler of handlers) {
    const prev = map.get(handler.channel_type) ?? 0;
    map.set(handler.channel_type, prev + handler.recipients.length);
  }
  return Array.from(map.entries()).map(([channel, count]) => ({
    channel,
    count,
  }));
};

type TimestampCellProps = {
  run: NotificationRunSummary | null;
};

const TimestampCell = ({ run }: TimestampCellProps) => {
  if (!run) {
    return <span>{t`Never`}</span>;
  }
  const date = dayjs(run.at);
  const isToday = date.isSame(dayjs(), "day");
  return (
    <Flex gap="sm" align="center">
      <Tooltip label={date.fromNow()}>
        {isToday ? (
          <span>{t`Today, ${date.format("LT")}`}</span>
        ) : (
          <DateTime value={run.at} unit="minute" />
        )}
      </Tooltip>
      {run.status === "failing" && (
        <Tooltip label={run.error} disabled={!run.error}>
          <Icon name="warning_round" c="error" size={14} />
        </Tooltip>
      )}
    </Flex>
  );
};

export const NotificationsTable = ({
  notifications,
  error,
  isLoading,
  selectedIds,
  sorting,
  onSortingChange,
  onToggleRow,
  onToggleAll,
  onRowClick,
}: Props) => {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    notifications.length > 0 &&
    notifications.every((n) => selectedSet.has(n.id));
  const someSelected =
    !allSelected && notifications.some((n) => selectedSet.has(n.id));

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    [sorting, onSortingChange],
  );

  const columns = useMemo<TreeTableColumnDef<AdminNotification>[]>(
    () => [
      {
        id: "_select",
        width: 48,
        enableSorting: false,
        header: () => (
          <Checkbox
            aria-label={t`Select all`}
            checked={allSelected}
            indeterminate={someSelected}
            onChange={onToggleAll}
            disabled={notifications.length === 0}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t`Select notification ${row.original.id}`}
            checked={selectedSet.has(row.original.id)}
            onChange={() => onToggleRow(row.original.id)}
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      {
        id: "id",
        header: t`ID`,
        width: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <Flex justify="center">
            <Badge
              variant="default"
              bg="background-secondary"
              c="text-primary"
              tt="none"
              bd="1px solid var(--mb-color-border)"
              h="auto"
              px="sm"
              py="xs"
              fz="md"
              lh="xs"
              fw={400}
              miw={29}
            >
              {row.original.id}
            </Badge>
          </Flex>
        ),
      },
      {
        id: "card_name",
        header: t`Question`,
        width: 280,
        enableSorting: true,
        cell: ({ row }) => {
          const card = row.original.payload?.card;
          const cardId = row.original.payload.card_id;
          const name = card?.name ?? `#${cardId}`;
          return <Ellipsified tooltip={name}>{name}</Ellipsified>;
        },
      },
      {
        id: "owner_name",
        header: t`Owner`,
        width: 200,
        enableSorting: true,
        cell: ({ row }) => {
          const owner = row.original.owner;
          const name = owner?.common_name ?? owner?.email ?? t`Unknown`;
          const isDeactivated = owner?.is_active === false;
          return (
            <Flex gap="xs" align="center" miw={0}>
              <Ellipsified tooltip={name}>{name}</Ellipsified>
              {isDeactivated && (
                <Tooltip label={t`Deactivated owner`}>
                  <Icon name="ghost" size={16} c="text-secondary" />
                </Tooltip>
              )}
            </Flex>
          );
        },
      },
      {
        id: "channel",
        header: t`Channel`,
        width: 172,
        enableSorting: false,
        cell: ({ row }) => {
          const summaries = summarizeChannels(row.original);
          if (summaries.length === 0) {
            return "—";
          }
          return (
            <Flex gap="sm" align="center" wrap="wrap">
              {summaries.map(({ channel, count }) => (
                <Tooltip key={channel} label={getChannelLabel(channel)}>
                  <Flex gap="xs" align="center">
                    <Icon
                      name={getChannelIconName(channel)}
                      c="text-secondary"
                      size={16}
                    />
                    <Text size="md" c="text-primary">
                      {count}
                    </Text>
                  </Flex>
                </Tooltip>
              ))}
            </Flex>
          );
        },
      },
      {
        id: "last_check",
        header: t`Last checked`,
        width: 170,
        enableSorting: false,
        cell: ({ row }) => <TimestampCell run={row.original.last_check} />,
      },
      {
        id: "last_sent",
        header: t`Last sent`,
        width: 200,
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => <TimestampCell run={row.original.last_sent} />,
      },
    ],
    [
      allSelected,
      someSelected,
      notifications.length,
      selectedSet,
      onToggleAll,
      onToggleRow,
    ],
  );

  const instance = useTreeTableInstance<AdminNotification>({
    data: notifications,
    columns,
    getNodeId,
    sorting,
    manualSorting: true,
    onSortingChange: handleSortingChange,
  });

  const handleRowClick = useCallback(
    (row: Row<AdminNotification>) => {
      onRowClick?.(row.original.id);
    },
    [onRowClick],
  );

  const getRowProps = useCallback(
    (row: Row<AdminNotification>) => ({
      "data-testid": `notification-row-${row.original.id}`,
    }),
    [],
  );

  if (isLoading || !!error) {
    return (
      <Card withBorder p="lg" data-testid="notifications-admin-table">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Card>
    );
  }

  return (
    <Card withBorder p={0} data-testid="notifications-admin-table">
      <TreeTable
        instance={instance}
        hierarchical={false}
        ariaLabel={t`Notifications`}
        onRowClick={handleRowClick}
        getRowProps={getRowProps}
        emptyState={
          <Flex c="text-tertiary" justify="center">{t`No results`}</Flex>
        }
      />
    </Card>
  );
};
