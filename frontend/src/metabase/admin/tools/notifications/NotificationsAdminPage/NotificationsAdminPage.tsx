import type { Row, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  useAdminListNotificationsQuery,
  useBulkNotificationActionMutation,
} from "metabase/api";
import {
  BulkActionBar,
  BulkActionButton,
  BulkActionDangerButton,
} from "metabase/common/components/BulkActionBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Flex, type SelectionState, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  AdminNotification,
  NotificationId,
  UserId,
} from "metabase-types/api";

import { SettingsPageWrapper } from "../../../components/SettingsSection";
import { ChangeOwnerModal } from "../ChangeOwnerModal";
import { NotificationDetailSidebar } from "../NotificationDetailSidebar";
import { SIDEBAR_WIDTH } from "../NotificationDetailSidebar/constants";
import { NotificationsFilters } from "../NotificationsFilters";
import { NotificationsSearchInput } from "../NotificationsSearchInput";
import { NotificationsTable } from "../NotificationsTable";
import { NotificationsTabs } from "../NotificationsTabs";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  PAGE_SIZE,
  SORT_COLUMN_VALUES,
} from "./constants";
import type { ChangeOwnerTarget, RouteParams } from "./types";
import { buildListParams, urlStateConfig } from "./utils";

export const NotificationsAdminPage = ({
  location,
  params,
}: WithRouterProps<RouteParams>) => {
  const notificationId = Urls.extractEntityId(params.notificationId);
  const dispatch = useDispatch();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [selectedIds, setSelectedIds] = useState<Set<NotificationId>>(
    new Set(),
  );
  const clearSelected = useCallback(() => setSelectedIds(new Set()), []);
  const getSelectionState = useCallback(
    (row: Row<AdminNotification>): SelectionState =>
      selectedIds.has(row.original.id) ? "all" : "none",
    [selectedIds],
  );
  const [changeOwnerTarget, setChangeOwnerTarget] =
    useState<ChangeOwnerTarget | null>(null);

  const { modalContent: confirmContent, show: showConfirm } = useConfirmation();

  const { data, isLoading, isFetching, error } = useAdminListNotificationsQuery(
    buildListParams(urlState, PAGE_SIZE),
  );
  const notifications = useMemo(() => data?.data ?? [], [data?.data]);
  const total = data?.total ?? 0;
  const selectedCount = selectedIds.size;

  const { data: failingData, isLoading: isFailingLoading } =
    useAdminListNotificationsQuery({
      limit: 1,
      offset: 0,
      active: true,
      last_send_status: "failing",
    });
  const { data: ownerlessData, isLoading: isOwnerlessLoading } =
    useAdminListNotificationsQuery({
      limit: 1,
      offset: 0,
      active: true,
      creatorless: true,
    });
  const failingCount = failingData?.total ?? 0;
  const ownerlessCount = ownerlessData?.total ?? 0;

  useEffect(() => {
    if (
      (urlState.tab === "failing" && failingData && failingCount === 0) ||
      (urlState.tab === "ownerless" && ownerlessData && ownerlessCount === 0)
    ) {
      patchUrlState({ tab: "all", page: 0 });
    }
  }, [
    urlState.tab,
    failingData,
    failingCount,
    ownerlessData,
    ownerlessCount,
    patchUrlState,
  ]);

  const [bulkAction, { isLoading: isBulkLoading }] =
    useBulkNotificationActionMutation();

  useEffect(() => {
    clearSelected();
  }, [
    clearSelected,
    urlState.page,
    urlState.active,
    urlState.tab,
    urlState.last_send_status,
    urlState.creatorless,
    urlState.query,
    urlState.channel,
    urlState.recipient_email,
    urlState.sort_column,
    urlState.sort_direction,
  ]);

  const sorting: SortingState = [
    {
      id: urlState.sort_column,
      desc: urlState.sort_direction === "desc",
    },
  ];

  const handleSortingChange = useCallback(
    (next: SortingState) => {
      if (next.length === 0) {
        patchUrlState({
          sort_column: DEFAULT_SORT_COLUMN,
          sort_direction: DEFAULT_SORT_DIRECTION,
          page: 0,
        });
        return;
      }
      const [first] = next;
      const column = SORT_COLUMN_VALUES.find((col) => col === first.id);
      if (column === undefined) {
        return;
      }
      patchUrlState({
        sort_column: column,
        sort_direction: first.desc ? "desc" : "asc",
        page: 0,
      });
    },
    [patchUrlState],
  );

  const handleToggleRow = useCallback((id: NotificationId) => {
    setSelectedIds((prev) =>
      prev.has(id)
        ? new Set([...prev].filter((x) => x !== id))
        : new Set([...prev, id]),
    );
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = notifications.map((n) => n.id);
      const allSelected =
        allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set([...prev, ...allIds]);
    });
  }, [notifications]);

  const handleRowClick = (id: NotificationId) => {
    dispatch(push(Urls.adminToolsNotificationDetail(id)));
  };

  const handleSidebarClose = () => {
    dispatch(push(Urls.adminToolsNotifications()));
  };

  const deleteNotifications = useCallback(
    async (notificationIds: NotificationId[]) => {
      const count = notificationIds.length;
      try {
        await bulkAction({
          notification_ids: notificationIds,
          action: "archive",
        }).unwrap();
        dispatch(
          addUndo({
            message:
              count === 1 ? t`Deleted 1 alert` : t`Deleted ${count} alerts`,
          }),
        );
        clearSelected();
      } catch {
        dispatch(
          addUndo({
            icon: "warning",
            message: t`Could not delete alerts.`,
          }),
        );
      }
    },
    [bulkAction, clearSelected, dispatch],
  );

  const handleDeleteBulk = useCallback(() => {
    const count = selectedIds.size;
    showConfirm({
      title: count === 1 ? t`Delete 1 alert?` : t`Delete ${count} alerts?`,
      message: t`Recipients will stop receiving these alerts.`,
      confirmButtonText: t`Delete`,
      confirmButtonProps: { color: "danger" },
      onConfirm: () => deleteNotifications(Array.from(selectedIds)),
    });
  }, [deleteNotifications, selectedIds, showConfirm]);

  const handleSidebarDelete = useCallback(
    (id: NotificationId) => {
      showConfirm({
        title: t`Delete this alert?`,
        message: t`Recipients will stop receiving this alert.`,
        confirmButtonText: t`Delete`,
        confirmButtonProps: { color: "danger" },
        onConfirm: () => deleteNotifications([id]),
      });
    },
    [deleteNotifications, showConfirm],
  );

  const handleChangeOwnerConfirm = useCallback(
    async (creatorId: UserId) => {
      if (!changeOwnerTarget) {
        return;
      }
      const { ids, isBulk } = changeOwnerTarget;
      const count = ids.length;
      try {
        await bulkAction({
          notification_ids: ids,
          action: "change-creator",
          creator_id: creatorId,
        }).unwrap();
        dispatch(
          addUndo({
            message:
              count === 1
                ? t`Changed owner for 1 alert`
                : t`Changed owner for ${count} alerts`,
          }),
        );
        if (isBulk) {
          clearSelected();
        }
        setChangeOwnerTarget(null);
      } catch {
        dispatch(
          addUndo({
            icon: "warning",
            message: t`Could not change owner.`,
          }),
        );
      }
    },
    [bulkAction, changeOwnerTarget, clearSelected, dispatch],
  );

  const isSidebarOpen = notificationId !== undefined;

  if (isLoading || isFailingLoading || isOwnerlessLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  const { prevNotificationId, nextNotificationId, notificationSummary } =
    (() => {
      if (notificationId === undefined) {
        return {
          prevNotificationId: undefined,
          nextNotificationId: undefined,
          notificationSummary: undefined,
        };
      }
      const index = notifications.findIndex((n) => n.id === notificationId);
      if (index === -1) {
        return {
          prevNotificationId: undefined,
          nextNotificationId: undefined,
          notificationSummary: undefined,
        };
      }
      return {
        prevNotificationId: index > 0 ? notifications[index - 1].id : undefined,
        nextNotificationId:
          index < notifications.length - 1
            ? notifications[index + 1].id
            : undefined,
        notificationSummary: notifications[index],
      };
    })();

  return (
    <SettingsPageWrapper pr={isSidebarOpen ? `${SIDEBAR_WIDTH}px` : 0}>
      <Flex align="center" gap="sm">
        <Title order={1}>{t`Alerts management`}</Title>
      </Flex>

      <NotificationsTabs
        tab={urlState.tab}
        failingCount={failingCount}
        ownerlessCount={ownerlessCount}
        onChange={(patch) => patchUrlState({ ...patch, page: 0 })}
      />

      <Flex gap="md" align="center">
        <NotificationsSearchInput
          value={urlState.query}
          isLoading={isFetching}
          onChange={(query) => patchUrlState({ query, page: 0 })}
        />
        <NotificationsFilters state={urlState} onChange={patchUrlState} />
      </Flex>

      <NotificationsTable
        notifications={notifications}
        error={error}
        isLoading={isLoading}
        getSelectionState={getSelectionState}
        selectedDetailId={notificationId}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        onToggleRow={handleToggleRow}
        onToggleAll={handleToggleAll}
        onRowClick={handleRowClick}
      />

      <Flex
        align="center"
        justify="space-between"
        p="md"
        data-testid="notifications-admin-footer"
      >
        <PaginationControls
          page={urlState.page}
          pageSize={PAGE_SIZE}
          itemsLength={notifications.length}
          total={total}
          onPreviousPage={() => patchUrlState({ page: urlState.page - 1 })}
          onNextPage={() => patchUrlState({ page: urlState.page + 1 })}
        />
      </Flex>

      {isSidebarOpen && (
        <NotificationDetailSidebar
          notificationId={notificationId}
          notificationSummary={notificationSummary}
          isBulkLoading={isBulkLoading}
          prevNotificationId={prevNotificationId}
          nextNotificationId={nextNotificationId}
          onClose={handleSidebarClose}
          onDelete={(notification) => handleSidebarDelete(notification.id)}
        />
      )}

      <BulkActionBar
        opened={selectedCount > 0}
        message={
          selectedCount === 1
            ? t`1 alert selected`
            : t`${selectedCount} alerts selected`
        }
      >
        <BulkActionDangerButton
          onClick={handleDeleteBulk}
          disabled={isBulkLoading}
        >
          {t`Delete`}
        </BulkActionDangerButton>
        <BulkActionButton
          onClick={() =>
            setChangeOwnerTarget({
              ids: Array.from(selectedIds),
              isBulk: true,
            })
          }
          disabled={isBulkLoading}
        >
          {t`Change owner`}
        </BulkActionButton>
        <BulkActionButton onClick={clearSelected}>{t`Clear`}</BulkActionButton>
      </BulkActionBar>

      <ChangeOwnerModal
        opened={changeOwnerTarget !== null}
        count={changeOwnerTarget?.ids.length ?? 0}
        isSubmitting={isBulkLoading}
        onClose={() => setChangeOwnerTarget(null)}
        onConfirm={handleChangeOwnerConfirm}
      />

      {confirmContent}
    </SettingsPageWrapper>
  );
};
