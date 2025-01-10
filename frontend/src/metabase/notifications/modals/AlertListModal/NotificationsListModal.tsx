import { useState } from "react";

import { useListNotificationsQuery } from "metabase/api";
import Modal from "metabase/components/Modal";
import type Question from "metabase-lib/v1/Question";
import type { Notification } from "metabase-types/api";

import { CreateAlertModalContent } from "../index";

import { NotificationsListModalContent } from "./NotificationsListModalContent";

type AlertModalMode = "list-modal" | "create-modal" | "update-modal";

export const NotificationsListModal = ({
  question,
  onClose,
}: {
  question: Question;
  onClose: () => void;
}) => {
  const [editingItem, setEditingItem] = useState<Notification | null>(null);

  const { data: questionNotifications } = useListNotificationsQuery({
    card_id: question.id(),
  });

  const [showingElement, setShowingElement] = useState<AlertModalMode>(
    !questionNotifications || questionNotifications.length === 0
      ? "create-modal"
      : "list-modal",
  );

  if (!question.isSaved()) {
    return null;
  }

  return (
    <>
      <Modal isOpen={showingElement === "list-modal"} onClose={onClose}>
        <NotificationsListModalContent
          questionAlerts={questionNotifications}
          onCreate={() => setShowingElement("create-modal")}
          onEdit={(notification: Notification) => {
            setEditingItem(notification);
            setShowingElement("update-modal");
          }}
          onClose={onClose}
        />
      </Modal>

      <Modal
        medium
        isOpen={
          showingElement === "create-modal" || showingElement === "update-modal"
        }
        onClose={onClose}
      >
        <CreateAlertModalContent
          editingNotification={
            showingElement === "update-modal" && editingItem
              ? editingItem
              : undefined
          }
          onCancel={onClose}
          onAlertCreated={onClose}
          onAlertUpdated={onClose}
        />
      </Modal>
    </>
  );
};
