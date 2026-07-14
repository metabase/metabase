import { useElementSize } from "@mantine/hooks";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useAdminListNotificationsQuery,
  useBulkNotificationActionMutation,
  useLazyAdminListNotificationsQuery,
} from "metabase/api";
import {
  BulkActionBar,
  BulkActionButton,
  BulkActionDangerButton,
} from "metabase/common/components/BulkActionBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { type WithRouterProps, push } from "metabase/router";
import { Flex, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { NotificationId, UserId } from "metabase-types/api";

import { ChangeOwnerModal } from "../ChangeOwnerModal";
import { NotificationDetailSidebar } from "../NotificationDetailSidebar";
import { SIDEBAR_WIDTH } from "../NotificationDetailSidebar/constants";
import { NotificationsFilters } from "../NotificationsFilters";
import { NotificationsSearchInput } from "../NotificationsSearchInput";
import { NotificationsTable } from "../NotificationsTable";
import { NotificationsTabs } from "../NotificationsTabs";
import {
  trackAlertsManagementAlertOpened,
  trackAlertsManagementAlertsDeleted,
  trackAlertsManagementOwnerChanged,
  trackAlertsManagementSearchPerformed,
} from "../analytics";

import S from "./NotificationsAdminPage.module.css";
import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  PAGE_SIZE,
  SORT_COLUMN_VALUES,
} from "./constants";
import type { RouteParams } from "./types";
import { buildListParams, urlStateConfig } from "./utils";

export const NotificationsAdminPage = ({
  location,
  params,
}: WithRouterProps<RouteParams>) => {
  const notificationId = Urls.extractEntityId(params.notificationId);
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const dispatch = useDispatch();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const clearSelected = useCallback(() => setRowSelection({}), []);
  const [isChangeOwnerOpened, setIsChangeOwnerOpened] = useState(false);

  const { modalContent: confirmContent, show: showConfirm } = useConfirmation();

  const { data, isLoading, isFetching, error } = useAbortableQuery(
    useLazyAdminListNotificationsQuery,
    buildListParams(urlState, PAGE_SIZE),
  );
  const notifications = useMemo(() => data?.data ?? [], [data?.data]);
  const total = data?.total ?? 0;
  const selectedNotifications = useMemo(
    () => notifications.filter((n) => rowSelection[String(n.id)]),
    [notifications, rowSelection],
  );
  const selectedCount = selectedNotifications.length;

  const { data: failingData, isLoading: isFailingLoading } =
    useAdminListNotificationsQuery({
      limit: 1,
      offset: 0,
      active: true,
      last_check_status: "failing",
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
    urlState.creator_active,
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

  const handleRowClick = (id: NotificationId) => {
    trackAlertsManagementAlertOpened(id, "table_row");
    dispatch(push(Urls.monitorNotificationDetail(id)));
  };

  const handleSearchChange = (query: string) => {
    if (query !== "") {
      trackAlertsManagementSearchPerformed();
    }
    patchUrlState({ query, page: 0 });
  };

  const handleSidebarClose = useCallback(() => {
    dispatch(push(Urls.monitorNotifications()));
  }, [dispatch]);

  const deleteNotifications = useCallback(
    async (
      notificationIds: NotificationId[],
      triggeredFrom: "bulk_action_bar" | "detail_sidebar",
    ) => {
      const count = notificationIds.length;
      try {
        await bulkAction({
          notification_ids: notificationIds,
          action: "archive",
        }).unwrap();
        trackAlertsManagementAlertsDeleted(triggeredFrom, "success", count);
        dispatch(
          addUndo({
            message:
              count === 1 ? t`Deleted 1 alert` : t`Deleted ${count} alerts`,
          }),
        );
        clearSelected();
        if (
          notificationId !== undefined &&
          notificationIds.includes(notificationId)
        ) {
          dispatch(push(Urls.monitorNotifications()));
        }
      } catch {
        trackAlertsManagementAlertsDeleted(triggeredFrom, "failure", count);
        dispatch(
          addUndo({
            icon: "warning",
            message: t`Could not delete alerts.`,
          }),
        );
      }
    },
    [bulkAction, clearSelected, dispatch, notificationId],
  );

  const handleDeleteBulk = useCallback(() => {
    const count = selectedNotifications.length;
    showConfirm({
      title: count === 1 ? t`Delete 1 alert?` : t`Delete ${count} alerts?`,
      message: t`Recipients will stop receiving these alerts.`,
      confirmButtonText: t`Delete`,
      confirmButtonProps: { color: "feedback-negative" },
      size: "md",
      onConfirm: () =>
        deleteNotifications(
          selectedNotifications.map((n) => n.id),
          "bulk_action_bar",
        ),
    });
  }, [deleteNotifications, selectedNotifications, showConfirm]);

  const handleSidebarDelete = useCallback(
    (id: NotificationId) => {
      showConfirm({
        title: t`Delete this alert?`,
        message: t`Recipients will stop receiving this alert.`,
        confirmButtonText: t`Delete`,
        confirmButtonProps: { color: "feedback-negative" },
        onConfirm: () => deleteNotifications([id], "detail_sidebar"),
      });
    },
    [deleteNotifications, showConfirm],
  );

  const handleChangeOwnerConfirm = useCallback(
    async (creatorId: UserId) => {
      const count = selectedNotifications.length;
      try {
        await bulkAction({
          notification_ids: selectedNotifications.map((n) => n.id),
          action: "change-creator",
          creator_id: creatorId,
        }).unwrap();
        trackAlertsManagementOwnerChanged("success", count);
        dispatch(
          addUndo({
            message:
              count === 1
                ? t`Changed owner for 1 alert`
                : t`Changed owner for ${count} alerts`,
          }),
        );
        clearSelected();
        setIsChangeOwnerOpened(false);
      } catch {
        trackAlertsManagementOwnerChanged("failure", count);
        dispatch(
          addUndo({
            icon: "warning",
            message: t`Could not change owner.`,
          }),
        );
      }
    },
    [bulkAction, selectedNotifications, clearSelected, dispatch],
  );

  const isSidebarOpen = notificationId !== undefined;
  const isPageLoading = isLoading || isFailingLoading || isOwnerlessLoading;

  const { prevNotificationId, nextNotificationId, notificationSummary } =
    useMemo(() => {
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
    }, [notificationId, notifications]);

  if (isPageLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <>
      <Flex ref={containerRef} h="100%" wrap="nowrap">
        <Stack className={S.main} flex={1} gap="md">
          <MonitorHeaderTitle>{t`Alerts management`}</MonitorHeaderTitle>

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
              onChange={handleSearchChange}
            />
            <NotificationsFilters state={urlState} onChange={patchUrlState} />
          </Flex>

          <NotificationsTable
            notifications={notifications}
            error={error}
            isLoading={isLoading}
            rowSelection={rowSelection}
            selectedDetailId={notificationId}
            sorting={sorting}
            onSortingChange={handleSortingChange}
            onRowSelectionChange={setRowSelection}
            onRowClick={handleRowClick}
          />

          <Flex justify="end">
            <PaginationControls
              page={urlState.page}
              pageSize={PAGE_SIZE}
              itemsLength={notifications.length}
              total={total}
              showTotal
              onPreviousPage={() => patchUrlState({ page: urlState.page - 1 })}
              onNextPage={() => patchUrlState({ page: urlState.page + 1 })}
            />
          </Flex>
        </Stack>

        {isSidebarOpen && (
          <Sidebar containerWidth={containerWidth} defaultWidth={SIDEBAR_WIDTH}>
            <NotificationDetailSidebar
              notificationId={notificationId}
              notificationSummary={notificationSummary}
              isBulkLoading={isBulkLoading}
              prevNotificationId={prevNotificationId}
              nextNotificationId={nextNotificationId}
              onClose={handleSidebarClose}
              onDelete={(notification) => handleSidebarDelete(notification.id)}
            />
          </Sidebar>
        )}
      </Flex>

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
          onClick={() => setIsChangeOwnerOpened(true)}
          disabled={isBulkLoading}
        >
          {t`Change owner`}
        </BulkActionButton>
        <BulkActionButton onClick={clearSelected}>{t`Clear`}</BulkActionButton>
      </BulkActionBar>

      <ChangeOwnerModal
        key={String(isChangeOwnerOpened)}
        opened={isChangeOwnerOpened}
        notifications={selectedNotifications}
        isSubmitting={isBulkLoading}
        onClose={() => setIsChangeOwnerOpened(false)}
        onConfirm={handleChangeOwnerConfirm}
      />

      {confirmContent}
    </>
  );
};
