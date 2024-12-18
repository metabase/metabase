import { useState } from "react";

import { useListCardAlertsQuery } from "metabase/api";
import Modal from "metabase/components/Modal";
import type Question from "metabase-lib/v1/Question";
import type { Alert } from "metabase-types/api";

import { CreateAlertModalContent, UpdateAlertModalContent } from "../index";

import { AlertListModalContent } from "./AlertListModalContent";

type AlertModalMode = "list-modal" | "create-modal" | "update-modal";

export const AlertListModal = ({
  question,
  onClose,
}: {
  question: Question;
  onClose: () => void;
}) => {
  const [showingElement, setShowingElement] =
    useState<AlertModalMode>("list-modal");
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);

  const { data: questionAlerts } = useListCardAlertsQuery({
    id: question.id(),
  });

  if (!question.isSaved()) {
    return null;
  }

  return (
    <>
      <Modal isOpen={showingElement === "list-modal"} onClose={onClose}>
        <AlertListModalContent
          questionAlerts={questionAlerts}
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
          type="alert"
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
