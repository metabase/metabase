import { type Ref, forwardRef, useState } from "react";
import { useMount } from "react-use";

import { useListCardAlertsQuery } from "metabase/api";
import Modal from "metabase/components/Modal";
import { Popover } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Alert } from "metabase-types/api";

import {
  CreateAlertModalContent,
  UpdateAlertModalContent,
} from "../AlertModals";

import { AlertListPopoverContent } from "./AlertListPopoverContent";

type AlertModalMode = "popover" | "create-modal" | "update-modal";

export const AlertPopover = forwardRef(function _AlertPopover(
  {
    question,
    target,
    onClose,
  }: {
    question: Question;
    target: JSX.Element;
    onClose: () => void;
  },
  ref: Ref<HTMLDivElement>,
) {
  const [showingElement, setShowingElement] =
    useState<AlertModalMode>("popover");
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);

  const { data: questionAlerts } = useListCardAlertsQuery({
    id: question.id(),
  });

  useMount(() => {
    // if there are no alerts when the component mounts, show the create modal
    if (questionAlerts && questionAlerts.length === 0) {
      setShowingElement("create-modal");
    }
  });

  if (!question.isSaved()) {
    return null;
  }

  return (
    <>
      <Popover
        opened={showingElement === "popover"}
        onClose={() => {
          // only close if we're not showing a modal
          if (showingElement === "popover") {
            onClose();
          }
        }}
        position="bottom-end"
      >
        <Popover.Target ref={ref}>{target}</Popover.Target>
        <Popover.Dropdown>
          <AlertListPopoverContent
            questionAlerts={questionAlerts}
            onCreate={() => setShowingElement("create-modal")}
            onEdit={(alert: Alert) => {
              setEditingAlert(alert);
              setShowingElement("update-modal");
            }}
            onClose={onClose}
          />
        </Popover.Dropdown>
      </Popover>
      <Modal
        medium
        isOpen={showingElement === "create-modal"}
        onClose={onClose}
      >
        <CreateAlertModalContent onCancel={onClose} onAlertCreated={onClose} />
      </Modal>

      <Modal
        medium
        isOpen={showingElement === "update-modal"}
        onClose={onClose}
      >
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
});
