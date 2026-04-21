import { useCallback, useEffect, useMemo, useState } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { msgid, ngettext, t } from "ttag";

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
import { addUndo } from "metabase/redux/undo";
import { Box, Flex, Title } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type { NotificationId } from "metabase-types/api";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "../../../components/SettingsSection";

import { ChangeOwnerModal } from "./ChangeOwnerModal";
import { NotificationsFilters } from "./NotificationsFilters";
import { NotificationsTable } from "./NotificationsTable";
import { buildListParams, urlStateConfig } from "./utils";

const PAGE_SIZE = 50;

export const NotificationsAdminPage = ({ location }: WithRouterProps) => {
  const dispatch = useDispatch();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [selectedIds, setSelectedIds] = useState<NotificationId[]>([]);
  const [isChangeOwnerOpen, setIsChangeOwnerOpen] = useState(false);

  const { modalContent: confirmContent, show: showConfirm } = useConfirmation();

  const {
    data: response,
    isFetching,
    error,
  } = useAdminListNotificationsQuery(buildListParams(urlState, PAGE_SIZE));

  const [bulkAction, { isLoading: isBulkLoading }] =
    useBulkNotificationActionMutation();

  const notifications = useMemo(() => response?.data ?? [], [response?.data]);
  const total = response?.total ?? 0;

  useEffect(() => {
    setSelectedIds([]);
  }, [
    urlState.page,
    urlState.status,
    urlState.health,
    urlState.creator_id,
    urlState.card_id,
    urlState.recipient_email,
    urlState.channel,
  ]);

  const handleToggleRow = useCallback((id: NotificationId) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = notifications.map((n) => n.id);
      const allSelected =
        allIds.length > 0 && allIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !allIds.includes(id));
      }
      return Array.from(new Set([...prev, ...allIds]));
    });
  }, [notifications]);

  const handleRowClick = useCallback(
    (id: NotificationId) => {
      dispatch(push(Urls.adminToolsNotificationDetail(id)));
    },
    [dispatch],
  );

  const handleArchive = useCallback(() => {
    const count = selectedIds.length;
    showConfirm({
      title: count === 1 ? t`Archive 1 alert?` : t`Archive ${count} alerts?`,
      message: t`Recipients will stop receiving these alerts.`,
      confirmButtonText: t`Archive`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        try {
          await bulkAction({
            notification_ids: selectedIds,
            action: "archive",
          }).unwrap();
          dispatch(
            addUndo({
              message:
                count === 1 ? t`Archived 1 alert` : t`Archived ${count} alerts`,
            }),
          );
          setSelectedIds([]);
        } catch {
          dispatch(
            addUndo({
              icon: "warning",
              message: t`Could not archive alerts.`,
            }),
          );
        }
      },
    });
  }, [bulkAction, dispatch, selectedIds, showConfirm]);

  const handleUnarchive = useCallback(() => {
    const count = selectedIds.length;
    showConfirm({
      title:
        count === 1 ? t`Unarchive 1 alert?` : t`Unarchive ${count} alerts?`,
      message: t`Recipients will begin receiving these alerts again on the next scheduled run.`,
      confirmButtonText: t`Unarchive`,
      onConfirm: async () => {
        try {
          await bulkAction({
            notification_ids: selectedIds,
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
          setSelectedIds([]);
        } catch {
          dispatch(
            addUndo({
              icon: "warning",
              message: t`Could not unarchive alerts.`,
            }),
          );
        }
      },
    });
  }, [bulkAction, dispatch, selectedIds, showConfirm]);

  const handleChangeOwnerConfirm = useCallback(
    async (ownerId: number) => {
      const count = selectedIds.length;
      try {
        await bulkAction({
          notification_ids: selectedIds,
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
        setSelectedIds([]);
        setIsChangeOwnerOpen(false);
      } catch {
        dispatch(
          addUndo({
            icon: "warning",
            message: t`Could not change owner.`,
          }),
        );
      }
    },
    [bulkAction, dispatch, selectedIds],
  );

  const selectedCount = selectedIds.length;

  return (
    <SettingsPageWrapper>
      <SettingsSection>
        <Title order={1}>{t`Notifications`}</Title>

        <NotificationsFilters state={urlState} onChange={patchUrlState} />

        <NotificationsTable
          notifications={notifications}
          error={error}
          isLoading={isFetching}
          selectedIds={selectedIds}
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
          <Box fw={700}>
            {ngettext(
              msgid`${total} alert found`,
              `${total} alerts found`,
              total,
            )}
          </Box>
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

        <BulkActionBar
          opened={selectedCount > 0}
          message={
            selectedCount === 1
              ? t`1 alert selected`
              : t`${selectedCount} alerts selected`
          }
        >
          {urlState.status === "archived" ? (
            <BulkActionButton
              onClick={handleUnarchive}
              disabled={isBulkLoading}
            >
              {t`Unarchive`}
            </BulkActionButton>
          ) : (
            <BulkActionDangerButton
              onClick={handleArchive}
              disabled={isBulkLoading}
            >
              {t`Archive`}
            </BulkActionDangerButton>
          )}
          <BulkActionButton
            onClick={() => setIsChangeOwnerOpen(true)}
            disabled={isBulkLoading}
          >
            {t`Change owner`}
          </BulkActionButton>
          <BulkActionButton onClick={() => setSelectedIds([])}>
            {t`Clear`}
          </BulkActionButton>
        </BulkActionBar>

        <ChangeOwnerModal
          opened={isChangeOwnerOpen}
          count={selectedCount}
          isSubmitting={isBulkLoading}
          onClose={() => setIsChangeOwnerOpen(false)}
          onConfirm={handleChangeOwnerConfirm}
        />

        {confirmContent}
      </SettingsSection>
    </SettingsPageWrapper>
  );
};
