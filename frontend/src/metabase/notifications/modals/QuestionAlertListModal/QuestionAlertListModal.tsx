import { useEffect, useState } from "react";
import { usePreviousDistinct } from "react-use";
import { t } from "ttag";

import {
  useListNotificationsQuery,
  useUnsubscribeFromNotificationMutation,
  useUpdateNotificationMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks/use-toast";
import { DeleteAlertConfirmModal } from "metabase/notifications/modals/DeleteAlertConfirmModal";
import { UnsubscribeConfirmModal } from "metabase/notifications/modals/UnsubscribeConfirmModal";
import type Question from "metabase-lib/v1/Question";
import type { Notification } from "metabase-types/api";

import { CreateOrEditQuestionAlertModal } from "../CreateOrEditQuestionAlertModal";

import { AlertListModal } from "./AlertListModal";

type AlertModalMode =
  | "list-modal"
  | "create-modal"
  | "update-modal"
  | "delete-confirm-modal"
  | "unsubscribe-confirm-modal";

export const QuestionAlertListModal = ({
  question,
  onClose,
}: {
  question: Question;
  onClose: () => void;
}) => {
  const [editingItem, setEditingItem] = useState<Notification | null>(null);

  const [sendToast] = useToast();

  const { data: questionNotifications } = useListNotificationsQuery({
    card_id: question.id(),
    include_inactive: false,
  });

  const [updateNotification] = useUpdateNotificationMutation();
  const [unsubscribe] = useUnsubscribeFromNotificationMutation();

  const [activeModal, setActiveModal] = useState<AlertModalMode | null>(
    questionNotifications ? getDefaultActiveModal(questionNotifications) : null,
  );

  useEffect(() => {
    /**
     * Attempt to set the active modal only once when it's null.
     *
     * In the core app, this is a noop because the data is already
     * loaded and activeModal will not be null. However, in the SDK,
     * we'll need to wait for the data to load, so the activeModal
     * will be null at first.
     */
    if (questionNotifications && activeModal === null) {
      setActiveModal(getDefaultActiveModal(questionNotifications));
    }
  }, [activeModal, questionNotifications]);

  const previousActiveModal = usePreviousDistinct(activeModal);

  const handleInternalModalClose = () => {
    if (previousActiveModal === "list-modal") {
      setActiveModal("list-modal");
    } else {
      onClose();
    }
  };

  const handleDelete = async (itemToDelete: Notification) => {
    const result = await updateNotification({
      ...itemToDelete,
      active: false,
    });

    if (result.error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: t`An error occurred`,
      });
      return;
    }

    sendToast({ message: t`The alert was successfully deleted.` });

    const alertCount = questionNotifications?.length || 0;
    // if we have just unsubscribed from the last alert, close the popover
    if (alertCount <= 1) {
      onClose();
    } else {
      handleInternalModalClose();
    }
  };

  const handleUnsubscribe = async (alert: Notification) => {
    const result = await unsubscribe(alert.id);

    if (result.error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: t`An error occurred`,
      });
      return;
    }

    sendToast({ message: t`Successfully unsubscribed.` });

    const alertCount = questionNotifications?.length || 0;
    // if we have just unsubscribed from the last alert, close the popover
    if (alertCount <= 1) {
      onClose();
    }
  };

  if (!question.isSaved()) {
    return null;
  }

  return (
    <>
      {activeModal === "list-modal" && (
        <AlertListModal
          opened
          questionAlerts={questionNotifications}
          onCreate={() => setActiveModal("create-modal")}
          onEdit={(notification: Notification) => {
            setEditingItem(notification);
            setActiveModal("update-modal");
          }}
          onClose={onClose}
          onDelete={(notification: Notification) => {
            setEditingItem(notification);
            setActiveModal("delete-confirm-modal");
          }}
          onUnsubscribe={(notification: Notification) => {
            setEditingItem(notification);
            setActiveModal("unsubscribe-confirm-modal");
          }}
        />
      )}

      {(activeModal === "create-modal" || activeModal === "update-modal") && (
        <CreateOrEditQuestionAlertModal
          question={question}
          editingNotification={
            activeModal === "update-modal" && editingItem
              ? editingItem
              : undefined
          }
          onClose={handleInternalModalClose}
          onAlertCreated={handleInternalModalClose}
          onAlertUpdated={handleInternalModalClose}
        />
      )}

      {activeModal === "delete-confirm-modal" && editingItem && (
        <DeleteAlertConfirmModal
          onConfirm={() => handleDelete(editingItem)}
          onClose={handleInternalModalClose}
        />
      )}

      {activeModal === "unsubscribe-confirm-modal" && editingItem && (
        <UnsubscribeConfirmModal
          onConfirm={() => handleUnsubscribe(editingItem)}
          onClose={handleInternalModalClose}
        />
      )}
    </>
  );
};

function getDefaultActiveModal(
  questionNotifications: Notification[],
): AlertModalMode {
  return questionNotifications.length === 0 ? "create-modal" : "list-modal";
}
