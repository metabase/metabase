import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { TimelineEvent } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody, ModalFooter } from "./DeleteEventModal.styled";

export interface DeleteEventModalProps {
  event: TimelineEvent;
  onDelete: (event: TimelineEvent) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const DeleteEventModal = ({
  event,
  onDelete,
  onCancel,
  onClose,
}: DeleteEventModalProps): JSX.Element => {
  const handleDelete = useCallback(async () => {
    await onDelete(event);
  }, [event, onDelete]);

  return (
    <div>
      <ModalHeader title={t`Delete ${event.name}?`} onClose={onClose} />
      <ModalBody>
        <ModalFooter>
          <Button onClick={onCancel}>{t`Cancel`}</Button>
          <Button danger onClick={handleDelete}>{t`Delete`}</Button>
        </ModalFooter>
      </ModalBody>
    </div>
  );
};

export default DeleteEventModal;
