import type { Row, SortingState, Updater } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { listChannelSummaries } from "metabase/monitor/tools/notifications/utils";
import type { SelectionState, TreeTableColumnDef } from "metabase/ui";
import {
  Badge,
  Card,
  Ellipsified,
  Flex,
  Icon,
  Text,
  Tooltip,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { getUserLabel } from "metabase/utils/user";
import type { AdminNotification, NotificationId } from "metabase-types/api";

import { NotificationSummary } from "../NotificationSummary";
import {
  getChannelIconName,
  getChannelLabel,
} from "../NotificationsAdminPage/utils";

type Props = {
  notifications: AdminNotification[];
  error: unknown;
  isLoading: boolean;
  getSelectionState: (row: Row<AdminNotification>) => SelectionState;
  selectedDetailId: NotificationId | undefined;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  onToggleRow: (id: NotificationId) => void;
  onToggleAll: () => void;
  onRowClick?: (id: NotificationId) => void;
};

const getNodeId = (notification: AdminNotification) => String(notification.id);

export const NotificationsTable = ({
  notifications,
  error,
  isLoading,
  getSelectionState,
  selectedDetailId,
  sorting,
  onSortingChange,
  onToggleRow,
  onToggleAll,
  onRowClick,
}: Props) => {
  const selectedRowId =
    selectedDetailId !== undefined ? String(selectedDetailId) : null;

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    [sorting, onSortingChange],
  );

  const handleCheckboxClick = useCallback(
    (row: Row<AdminNotification>) => {
      onToggleRow(row.original.id);
    },
    [onToggleRow],
  );

  const columns = useMemo<TreeTableColumnDef<AdminNotification>[]>(
    () => [
      {
        id: "id",
        header: t`ID`,
        width: 80,
        enableSorting: true,
        accessorFn: (notification) => notification.id,
        cell: ({ row }) => (
          <Flex justify="center">
            <Badge
              variant="default"
              bg="background_page-secondary"
              c="text-primary"
              tt="none"
              bd="1px solid var(--mb-color-border-neutral)"
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
        minWidth: 200,
        enableSorting: true,
        accessorFn: (notification) => notification.payload?.card?.name ?? "",
        cell: ({ row }) => {
          const card = row.original.payload?.card;
          const cardId = row.original.payload?.card_id;
          const name = card?.name ?? (cardId ? `#${cardId}` : t`Unknown`);
          return <Ellipsified tooltip={name}>{name}</Ellipsified>;
        },
      },
      {
        id: "creator_name",
        header: t`Owner`,
        width: "auto",
        minWidth: 140,
        maxAutoWidth: 320,
        enableSorting: true,
        accessorFn: (notification) =>
          notification.creator?.common_name ??
          notification.creator?.email ??
          "",
        cell: ({ row }) => {
          const creator = row.original.creator;
          const name = getUserLabel(creator);
          const isDeactivated = creator?.is_active === false;
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
        width: "auto",
        enableSorting: false,
        accessorFn: (notification) =>
          listChannelSummaries(notification)
            .map(({ channel, count }) => `${channel}${count}`)
            .join(" "),
        cell: ({ row }) => {
          const summaries = listChannelSummaries(row.original);
          if (summaries.length === 0) {
            return EMPTY_CELL_PLACEHOLDER;
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
        enableSorting: true,
        sortDescFirst: true,
        accessorFn: (notification) => notification.last_check?.at ?? "",
        cell: ({ row }) => (
          <NotificationSummary run={row.original.last_check} isCompact={true} />
        ),
      },
      {
        id: "last_send",
        header: t`Last send attempt`,
        width: 200,
        enableSorting: true,
        sortDescFirst: true,
        accessorFn: (notification) => notification.last_send?.at ?? "",
        cell: ({ row }) => (
          <NotificationSummary run={row.original.last_send} isCompact={true} />
        ),
      },
    ],
    [],
  );

  const instance = useTreeTableInstance<AdminNotification>({
    data: notifications,
    columns,
    getNodeId,
    sorting,
    manualSorting: true,
    onSortingChange: handleSortingChange,
    selectedRowId,
  });

  const { setActiveRowId } = instance;
  useEffect(() => {
    setActiveRowId(selectedRowId);
  }, [selectedRowId, setActiveRowId]);

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

  if (isLoading || error !== undefined) {
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
        showCheckboxes
        getSelectionState={getSelectionState}
        onCheckboxClick={handleCheckboxClick}
        onHeaderCheckboxClick={onToggleAll}
        headerCheckboxAriaLabel={t`Select all`}
        ariaLabel={t`Notifications`}
        onRowClick={handleRowClick}
        getRowProps={getRowProps}
        emptyState={
          <Flex c="text-disabled" justify="center">{t`No results`}</Flex>
        }
      />
    </Card>
  );
};
