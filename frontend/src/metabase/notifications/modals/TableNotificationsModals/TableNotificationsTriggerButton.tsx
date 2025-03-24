import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  useListNotificationsQuery,
  useUnsubscribeFromNotificationMutation,
} from "metabase/api";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type { Notification, TableNotification } from "metabase-types/api";

import { CreateOrEditTableNotificationModal } from "./CreateOrEditTableNotificationModal/CreateOrEditTableNotificationModal";
import { TableNotificationsListModal } from "./TableNotificationsListModal/TableNotificationsListModal";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { useUpdateNotificationMutation } from "metabase/api";
import { usePreviousDistinct } from "react-use";

interface TableNotificationsModalProps {
  tableId: number;
}

type AlertModalMode = "list-modal" | "create-modal" | "update-modal";

export const TableNotificationsTriggerButton = ({
  tableId,
  ...props
}: TableNotificationsModalProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const { data } = useListNotificationsQuery({
    table_id: tableId,
    include_inactive: false,
    payload_type: "notification/system-event",
  });
  const tableNotifications = useMemo(
    () => data?.filter(isTableNotification),
    [data],
  );

  const [editingItem, setEditingItem] = useState<Notification | null>(null);

  const [activeModal, setActiveModal] = useState<AlertModalMode | null>(null);

  const hasNotifications = tableNotifications && tableNotifications.length > 0;
  const handleOpen = () => {
    setIsOpen(true);
    setActiveModal(!hasNotifications ? "create-modal" : "list-modal");
  };
  const handleClose = () => {
    setIsOpen(false);
    setActiveModal(null);
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
  const handleUnsubscribe = async (alert: Notification) => {
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
      <Tooltip
        label={
          hasNotifications ? t`Edit notifications` : t`Create notification`
        }
      >
        <ActionIcon
          size="lg"
          variant="subtle"
          color="gray"
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
          onCreate={() => setActiveModal("create-modal")}
          onEdit={notification => {
            setEditingItem(notification);
            setActiveModal("update-modal");
          }}
          onClose={handleClose}
          onDelete={handleDelete}
          onUnsubscribe={handleUnsubscribe}
        />
      )}

      {(activeModal === "create-modal" || activeModal === "update-modal") && (
        <CreateOrEditTableNotificationModal
          tableId={tableId}
          notification={
            activeModal === "update-modal" && editingItem
              ? editingItem
              : undefined
          }
          onClose={handleClose}
          onNotificationCreated={handleClose}
          onNotificationUpdated={handleClose}
        />
      )}
    </>
  );
};

const isTableNotification = (
  notification: Notification,
): notification is TableNotification => {
  return notification.payload_type === "notification/system-event";
};
