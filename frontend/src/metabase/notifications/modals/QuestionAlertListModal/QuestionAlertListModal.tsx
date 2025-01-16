import { useState } from "react";
import { usePreviousDistinct } from "react-use";
import { t } from "ttag";

import {
  useListNotificationsQuery,
  useUpdateNotificationMutation,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Button, Flex, Modal, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Notification } from "metabase-types/api";

import { CreateOrEditQuestionAlertModal } from "../CreateOrEditQuestionAlertModal";

import { AlertListModal } from "./AlertListModal";

type AlertModalMode =
  | "list-modal"
  | "create-modal"
  | "update-modal"
  | "delete-confirm-modal";

export const QuestionAlertListModal = ({
  question,
  onClose,
}: {
  question: Question;
  onClose: () => void;
}) => {
  const [editingItem, setEditingItem] = useState<Notification | null>(null);

  const dispatch = useDispatch();

  const { data: questionNotifications } = useListNotificationsQuery({
    card_id: question.id(),
    include_inactive: false,
  });

  const [updateNotification] = useUpdateNotificationMutation();

  const [activeModal, setActiveModal] = useState<AlertModalMode>(
    !questionNotifications || questionNotifications.length === 0
      ? "create-modal"
      : "list-modal",
  );

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

    handleInternalModalClose();
  };

  if (!question.isSaved()) {
    return null;
  }

  return (
    <>
      <AlertListModal
        opened={activeModal === "list-modal"}
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
      />

      {(activeModal === "create-modal" || activeModal === "update-modal") && (
        <CreateOrEditQuestionAlertModal
          opened
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

      {editingItem && (
        <Modal
          opened={activeModal === "delete-confirm-modal"}
          data-testid="alert-delete"
          title={t`Delete this alert?`}
          size="lg"
          onClose={handleInternalModalClose}
        >
          <Text py="1rem">{t`This can't be undone.`}</Text>
          <Flex justify="flex-end" gap="0.75rem">
            <Button onClick={handleInternalModalClose}>{t`Cancel`}</Button>
            <Button
              variant="filled"
              color="error"
              onClick={() => handleDelete(editingItem)}
            >{t`Delete it`}</Button>
            {/* TODO: add DeleteAlertSection content here ??? */}
          </Flex>
        </Modal>
      )}
    </>
  );
};
