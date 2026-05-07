import type { SortingState } from "@tanstack/react-table";
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
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Flex, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { NotificationId, UserId } from "metabase-types/api";

import { SettingsPageWrapper } from "../../../components/SettingsSection";

import { ChangeOwnerModal } from "./ChangeOwnerModal";
import {
  NotificationDetailSidebar,
  SIDEBAR_WIDTH,
} from "./NotificationDetailSidebar";
import { NotificationsFiltersDropdown } from "./NotificationsFiltersDropdown";
import { NotificationsSearchInput } from "./NotificationsSearchInput";
import { NotificationsTable } from "./NotificationsTable";
import { NotificationsTabs } from "./NotificationsTabs";
import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  SORT_COLUMN_VALUES,
  buildListParams,
  urlStateConfig,
} from "./utils";

const PAGE_SIZE = 50;

type RouteParams = {
  notificationId?: string;
};

type ChangeOwnerTarget = {
  ids: NotificationId[];
  isBulk: boolean;
};

export const NotificationsAdminPage = ({
  location,
  params,
}: WithRouterProps<RouteParams>) => {
  const notificationId = Urls.extractEntityId(params.notificationId);
  const dispatch = useDispatch();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [selectedIds, setSelectedIds] = useState<NotificationId[]>([]);
  const [changeOwnerTarget, setChangeOwnerTarget] =
    useState<ChangeOwnerTarget | null>(null);

  const { modalContent: confirmContent, show: showConfirm } = useConfirmation();

  const { data, isLoading, isFetching, error } = useAdminListNotificationsQuery(
    buildListParams(urlState, PAGE_SIZE),
  );
  const notifications = data?.data ?? [];
  const total = data?.total ?? 0;
  const selectedCount = selectedIds.length;

  const [bulkAction, { isLoading: isBulkLoading }] =
    useBulkNotificationActionMutation();

  useEffect(() => {
    setSelectedIds([]);
  }, [
    urlState.page,
    urlState.active,
    urlState.tab,
    urlState.last_sent_status,
    urlState.owner_active,
    urlState.query,
    urlState.channel,
    urlState.recipient_email,
    urlState.sort_column,
    urlState.sort_direction,
  ]);

  const sorting = useMemo<SortingState>(
    () => [
      {
        id: urlState.sort_column,
        desc: urlState.sort_direction === "desc",
      },
    ],
    [urlState.sort_column, urlState.sort_direction],
  );

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
      if (column == null) {
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

  const handleToggleRow = (id: NotificationId) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleToggleAll = () => {
    setSelectedIds((prev) => {
      const allIds = notifications.map((n) => n.id);
      const allSelected =
        allIds.length > 0 && allIds.every((id) => prev.includes(id));
      if (allSelected) {
        return [];
      }
      return Array.from(new Set([...prev, ...allIds]));
    });
  };

  const handleRowClick = (id: NotificationId) => {
    dispatch(push(Urls.adminToolsNotificationDetail(id)));
  };

  const handleSidebarClose = () => {
    dispatch(push(Urls.adminToolsNotifications()));
  };

  const deleteIds = useCallback(
    async (ids: NotificationId[], isBulk: boolean) => {
      const count = ids.length;
      try {
        await bulkAction({ notification_ids: ids, action: "archive" }).unwrap();
        dispatch(
          addUndo({
            message:
              count === 1 ? t`Archived 1 alert` : t`Archived ${count} alerts`,
          }),
        );
        if (isBulk) {
          setSelectedIds([]);
        }
      } catch {
        dispatch(
          addUndo({
            icon: "warning",
            message: t`Could not archive alerts.`,
          }),
        );
      }
    },
    [bulkAction, dispatch],
  );

  const unarchiveIds = useCallback(
    async (ids: NotificationId[], isBulk: boolean) => {
      const count = ids.length;
      try {
        await bulkAction({
          notification_ids: ids,
          action: "unarchive",
        }).unwrap();
        dispatch(
          addUndo({
            message:
              count === 1
                ? t`Unarchived 1 alert`
                : t`Unarchived ${count} alerts`,
          }),
        );
        if (isBulk) {
          setSelectedIds([]);
        }
      } catch {
        dispatch(
          addUndo({
            icon: "warning",
            message: t`Could not unarchive alerts.`,
          }),
        );
      }
    },
    [bulkAction, dispatch],
  );

  const handleArchiveBulk = useCallback(() => {
    const count = selectedIds.length;
    showConfirm({
      title: count === 1 ? t`Archive 1 alert?` : t`Archive ${count} alerts?`,
      message: t`Recipients will stop receiving these alerts.`,
      confirmButtonText: t`Archive`,
      confirmButtonProps: { color: "danger" },
      onConfirm: () => deleteIds(selectedIds, true),
    });
  }, [deleteIds, selectedIds, showConfirm]);

  const handleUnarchiveBulk = useCallback(() => {
    const count = selectedIds.length;
    showConfirm({
      title:
        count === 1 ? t`Unarchive 1 alert?` : t`Unarchive ${count} alerts?`,
      message: t`Recipients will begin receiving these alerts again on the next scheduled run.`,
      confirmButtonText: t`Unarchive`,
      onConfirm: () => unarchiveIds(selectedIds, true),
    });
  }, [unarchiveIds, selectedIds, showConfirm]);

  const handleSidebarDelete = useCallback(
    (id: NotificationId) => {
      showConfirm({
        title: t`Delete this alert?`,
        message: t`Recipients will stop receiving this alert.`,
        confirmButtonText: t`Delete`,
        confirmButtonProps: { color: "danger" },
        onConfirm: () => deleteIds([id], false),
      });
    },
    [deleteIds, showConfirm],
  );

  const handleChangeOwnerConfirm = useCallback(
    async (ownerId: UserId) => {
      if (!changeOwnerTarget) {
        return;
      }
      const { ids, isBulk } = changeOwnerTarget;
      const count = ids.length;
      try {
        await bulkAction({
          notification_ids: ids,
          action: "change-owner",
          owner_id: ownerId,
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
          setSelectedIds([]);
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
    [bulkAction, changeOwnerTarget, dispatch],
  );

  const isSidebarOpen = notificationId !== undefined;

  return (
    <SettingsPageWrapper pr={isSidebarOpen ? `${SIDEBAR_WIDTH}px` : 0}>
      <Flex align="center" gap="sm">
        <Title order={1}>{t`Alerts management`}</Title>
      </Flex>

      <NotificationsTabs
        tab={urlState.tab}
        onChange={(patch) => patchUrlState({ ...patch, page: 0 })}
      />

      <Flex gap="md" align="center">
        <NotificationsSearchInput
          value={urlState.query}
          isLoading={isFetching}
          onChange={(query) => patchUrlState({ query, page: 0 })}
        />
        <NotificationsFiltersDropdown
          state={urlState}
          onChange={patchUrlState}
        />
      </Flex>

      <NotificationsTable
        notifications={notifications}
        error={error}
        isLoading={isLoading}
        selectedIds={selectedIds}
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
          onPreviousPage={() =>
            patchUrlState({ page: Math.max(0, urlState.page - 1) })
          }
          onNextPage={() => patchUrlState({ page: urlState.page + 1 })}
        />
      </Flex>

      {isSidebarOpen && (
        <NotificationDetailSidebar
          notificationId={notificationId}
          isBulkLoading={isBulkLoading}
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
        {urlState.active === false ? (
          <BulkActionButton
            onClick={handleUnarchiveBulk}
            disabled={isBulkLoading}
          >
            {t`Unarchive`}
          </BulkActionButton>
        ) : (
          <BulkActionDangerButton
            onClick={handleArchiveBulk}
            disabled={isBulkLoading}
          >
            {t`Archive`}
          </BulkActionDangerButton>
        )}
        <BulkActionButton
          onClick={() =>
            setChangeOwnerTarget({ ids: selectedIds, isBulk: true })
          }
          disabled={isBulkLoading}
        >
          {t`Change owner`}
        </BulkActionButton>
        <BulkActionButton onClick={() => setSelectedIds([])}>
          {t`Clear`}
        </BulkActionButton>
      </BulkActionBar>

      <ChangeOwnerModal
        opened={changeOwnerTarget != null}
        count={changeOwnerTarget?.ids.length ?? 0}
        isSubmitting={isBulkLoading}
        onClose={() => setChangeOwnerTarget(null)}
        onConfirm={handleChangeOwnerConfirm}
      />

      {confirmContent}
    </SettingsPageWrapper>
  );
};
