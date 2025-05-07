import { useState } from "react";
import { usePreviousDistinct } from "react-use";
import { t } from "ttag";

import {
  useTableNotificationsQuery,
  useUnsubscribeFromNotificationMutation,
  useUpdateNotificationMutation,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { DeleteConfirmModal } from "metabase/notifications/modals/shared/DeleteConfirmModal";
import { UnsubscribeConfirmModal } from "metabase/notifications/modals/shared/UnsubscribeConfirmModal";
import { addUndo } from "metabase/redux/undo";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type { TableId, TableNotification } from "metabase-types/api";

import { CreateOrEditTableNotificationModal } from "../CreateOrEditTableNotificationModal/CreateOrEditTableNotificationModal";
import { TableNotificationsListModal } from "../TableNotificationsListModal/TableNotificationsListModal";

import S from "./TableNotificationsTrigger.module.css";

interface TableNotificationsModalProps {
  tableId: TableId;
}

type AlertModalMode =
  | "list-modal"
  | "create-edit-modal"
  | "delete-confirm-modal"
  | "unsubscribe-confirm-modal";

export const TableNotificationsTrigger = ({
  tableId,
  ...props
}: TableNotificationsModalProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const { data: tableNotifications } = useTableNotificationsQuery({
    table_id: tableId,
    include_inactive: false,
    payload_type: "notification/system-event",
  });

  const [editingItem, setEditingItem] = useState<TableNotification | null>(
    null,
  );

  const [activeModal, setActiveModal] = useState<AlertModalMode | null>(null);

  const hasNotifications = tableNotifications && tableNotifications.length > 0;
  const handleOpen = () => {
    setIsOpen(true);
    setActiveModal(hasNotifications ? "list-modal" : "create-edit-modal");
  };
  const handleClose = () => {
    setIsOpen(false);
    setActiveModal(null);
    setEditingItem(null);
  };
  const previousActiveModal = usePreviousDistinct(activeModal);
  const handleInternalModalClose = () => {
    if (previousActiveModal === "list-modal") {
      setActiveModal("list-modal");
    } else {
      handleClose();
    }
  };

  const dispatch = useDispatch();
  const [updateNotification] = useUpdateNotificationMutation();
  const handleDelete = async (itemToDelete: TableNotification) => {
    const result = await updateNotification({
      ...itemToDelete,
      active: false,
    });

    if (result.error) {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: t`An error occurred`,
        }),
      );
      return;
    }

    dispatch(addUndo({ message: t`The alert was successfully deleted.` }));

    const notificationsCount = tableNotifications?.length || 0;
    // if we have just unsubscribed from the last alert, close the popover
    if (notificationsCount <= 1) {
      handleClose();
    } else {
      handleInternalModalClose();
    }
  };

  const [unsubscribe] = useUnsubscribeFromNotificationMutation();
  const handleUnsubscribe = async (alert: TableNotification) => {
    const result = await unsubscribe(alert.id);

    if (result.error) {
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: t`An error occurred`,
        }),
      );
      return;
    }

    dispatch(addUndo({ message: t`Successfully unsubscribed.` }));

    const notificationsCount = tableNotifications?.length || 0;
    // if we have just unsubscribed from the last alert, close the popover
    if (notificationsCount <= 1) {
      handleClose();
    }
  };

  return (
    <>
      <Tooltip label={hasNotifications ? t`Edit alerts` : t`Create alert`}>
        <ActionIcon
          className={S.alertIcon}
          variant="subtle"
          size="lg"
          onClick={handleOpen}
          {...props}
        >
          <Icon name="alert" />
        </ActionIcon>
      </Tooltip>

      {activeModal === "list-modal" && (
        <TableNotificationsListModal
          opened={isOpen}
          notifications={tableNotifications}
          onCreate={() => setActiveModal("create-edit-modal")}
          onEdit={(notification) => {
            setEditingItem(notification);
            setActiveModal("create-edit-modal");
          }}
          onClose={handleClose}
          onDelete={(notification) => {
            setEditingItem(notification);
            setActiveModal("delete-confirm-modal");
          }}
          onUnsubscribe={(notification) => {
            setEditingItem(notification);
            setActiveModal("unsubscribe-confirm-modal");
          }}
        />
      )}

      {activeModal === "create-edit-modal" && (
        <CreateOrEditTableNotificationModal
          tableId={tableId}
          notification={editingItem}
          onClose={handleClose}
          onNotificationCreated={handleClose}
          onNotificationUpdated={handleClose}
        />
      )}
      {activeModal === "delete-confirm-modal" && editingItem && (
        <DeleteConfirmModal
          title={t`Delete this alert?`}
          onConfirm={() => handleDelete(editingItem)}
          onClose={handleInternalModalClose}
        />
      )}

      {activeModal === "unsubscribe-confirm-modal" && editingItem && (
        <UnsubscribeConfirmModal
          title={t`Unsubscribe from this alert?`}
          description={t`You'll stop receiving this alert from now on. Depending on your organization’s permissions you might need to ask a moderator to be re-added in the future.`}
          onConfirm={() => handleUnsubscribe(editingItem)}
          onClose={handleInternalModalClose}
        />
      )}
    </>
  );
};
