import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import { ModalBody, ModalFooter } from "./DeleteEventModal.styled";

export interface DeleteEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  collection: Collection;
  onSubmit: (
    event: TimelineEvent,
    timeline: Timeline,
    collection: Collection,
  ) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const DeleteEventModal = ({
  event,
  timeline,
  collection,
  onSubmit,
  onCancel,
  onClose,
}: DeleteEventModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(event, timeline, collection);
  }, [event, timeline, collection, onSubmit]);

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
