import { useState } from "react";
import { useMount } from "react-use";

import { useListCardAlertsQuery } from "metabase/api";
import Modal from "metabase/components/Modal";
import { isAlert, isSubscription } from "metabase/notifications/utils";
import type Question from "metabase-lib/v1/Question";
import type { Alert } from "metabase-types/api";

import { CreateAlertModalContent, UpdateAlertModalContent } from "../index";

import { AlertListModalContent } from "./AlertListModalContent";

type AlertModalMode = "list-modal" | "create-modal" | "update-modal";

export const AlertListModal = ({
  notificationType,
  question,
  onClose,
}: {
  notificationType: "alert" | "subscription";
  question: Question;
  onClose: () => void;
}) => {
  const [showingElement, setShowingElement] =
    useState<AlertModalMode>("list-modal");
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);

  const { data: questionNotifications } = useListCardAlertsQuery({
    id: question.id(),
  });

  const filteredByTypeNotifications = questionNotifications?.filter(
    notificationType === "alert" ? isAlert : isSubscription,
  );

  useMount(() => {
    // if there are no alerts when the component mounts, show the create modal
    if (
      filteredByTypeNotifications &&
      filteredByTypeNotifications.length === 0
    ) {
      setShowingElement("create-modal");
    }
  });

  if (!question.isSaved()) {
    return null;
  }

  return (
    <>
      <Modal isOpen={showingElement === "list-modal"} onClose={onClose}>
        <AlertListModalContent
          notificationType={notificationType}
          questionAlerts={filteredByTypeNotifications}
          onCreate={() => setShowingElement("create-modal")}
          onEdit={(alert: Alert) => {
            setEditingAlert(alert);
            setShowingElement("update-modal");
          }}
          onClose={onClose}
        />
      </Modal>

      <Modal isOpen={showingElement === "create-modal"} onClose={onClose}>
        <CreateAlertModalContent
          notificationType={notificationType}
          onCancel={onClose}
          onAlertCreated={onClose}
        />
      </Modal>

      <Modal isOpen={showingElement === "update-modal"} onClose={onClose}>
        {editingAlert && (
          <UpdateAlertModalContent
            alert={editingAlert}
            onCancel={onClose}
            onAlertUpdated={onClose}
          />
        )}
      </Modal>
    </>
  );
};
