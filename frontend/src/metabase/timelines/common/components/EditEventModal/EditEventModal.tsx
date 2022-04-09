import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import { Timeline, TimelineEvent } from "metabase-types/api";
import ModalBody from "../ModalBody";
import ModalDangerButton from "../ModalDangerButton";
import ModalHeader from "../ModalHeader";

export interface EditEventModalProps {
  event: TimelineEvent;
  timeline?: Timeline;
  onSubmit: (event: TimelineEvent, timeline?: Timeline) => void;
  onSubmitSuccess?: () => void;
  onArchive: (event: TimelineEvent, timeline?: Timeline) => void;
  onArchiveSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const EditEventModal = ({
  event,
  timeline,
  onSubmit,
  onSubmitSuccess,
  onArchive,
  onArchiveSuccess,
  onCancel,
  onClose,
}: EditEventModalProps): JSX.Element => {
  const form = useMemo(() => forms.details(), []);

  const handleSubmit = useCallback(
    async (event: TimelineEvent) => {
      await onSubmit(event, timeline);
      onSubmitSuccess?.();
    },
    [timeline, onSubmit, onSubmitSuccess],
  );

  const handleArchive = useCallback(async () => {
    await onArchive(event, timeline);
    onArchiveSuccess?.();
  }, [event, timeline, onArchive, onArchiveSuccess]);

  return (
    <div>
      <ModalHeader title={t`Edit event`} onClose={onClose} />
      <ModalBody>
        <Form
          form={form}
          initialValues={event}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={onCancel}
          footerExtraButtons={
            <ModalDangerButton onClick={handleArchive}>
              {t`Archive event`}
            </ModalDangerButton>
          }
        />
      </ModalBody>
    </div>
  );
};

export default EditEventModal;
