import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody, ModalFooter } from "./DeleteEventModal.styled";

export interface DeleteEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  collection: Collection;
  onSubmit: (event: TimelineEvent) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const DeleteEventModal = ({
  event,
  onSubmit,
  onCancel,
  onClose,
}: DeleteEventModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(event);
  }, [event, onSubmit]);

  return (
    <div>
      <ModalHeader title={t`Delete ${event?.name}?`} onClose={onClose} />
      <ModalBody>
        <ModalFooter>
          <Button onClick={onCancel}>{t`Cancel`}</Button>
          <Button danger onClick={handleSubmit}>{t`Delete`}</Button>
        </ModalFooter>
      </ModalBody>
    </div>
  );
};

export default DeleteEventModal;
