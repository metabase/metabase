import React, { useCallback } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody, ModalDangerButton } from "./EditEventModal.styled";

export interface EditEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  collection: Collection;
  onSubmit: (
    values: Partial<TimelineEvent>,
    timeline: Timeline,
    collection: Collection,
  ) => void;
  onArchive: (event: TimelineEvent) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const EditEventModal = ({
  event,
  timeline,
  collection,
  onSubmit,
  onArchive,
  onCancel,
  onClose,
}: EditEventModalProps): JSX.Element => {
  const handleSubmit = useCallback(
    async (values: Partial<TimelineEvent>) => {
      await onSubmit(values, timeline, collection);
    },
    [timeline, collection, onSubmit],
  );

  const handleArchive = useCallback(async () => {
    await onArchive(event);
  }, [event, onArchive]);

  return (
    <div>
      <ModalHeader title={t`Edit event`} onClose={onClose} />
      <ModalBody>
        <Form
          form={forms.collection}
          initialValues={event}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={onCancel}
          footerExtraButtons={
            <ModalDangerButton type="button" borderless onClick={handleArchive}>
              {t`Archive event`}
            </ModalDangerButton>
          }
        />
      </ModalBody>
    </div>
  );
};

export default EditEventModal;
