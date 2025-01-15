import { useState } from "react";
import { usePreviousDistinct } from "react-use";
import { t } from "ttag";

import {
  useListNotificationsQuery,
  useUpdateNotificationMutation,
} from "metabase/api";
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
    await updateNotification({
      ...itemToDelete,
      active: false,
    });

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
              color="danger"
              onClick={() => handleDelete(editingItem)}
            >{t`Delete it`}</Button>
          </Flex>
        </Modal>
      )}
    </>
  );
};
