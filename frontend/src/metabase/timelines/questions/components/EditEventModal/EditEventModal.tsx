import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import { TimelineEvent } from "metabase-types/api";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { ModalBody, ModalDangerButton } from "./EditEventModal.styled";

export interface EditEventModalProps {
  event: TimelineEvent;
  onSubmit: (event: TimelineEvent) => void;
  onArchive: (event: TimelineEvent) => void;
  onClose?: () => void;
}

const EditEventModal = ({
  event,
  onSubmit,
  onArchive,
  onClose,
}: EditEventModalProps): JSX.Element => {
  const form = useMemo(() => forms.details(), []);

  const handleSubmit = useCallback(
    async (event: TimelineEvent) => {
      await onSubmit(event);
      onClose?.();
    },
    [onSubmit, onClose],
  );

  const handleArchive = useCallback(async () => {
    await onArchive(event);
    onClose?.();
  }, [event, onArchive, onClose]);

  return (
    <div>
      <ModalHeader title={t`Edit event`} onClose={onClose} />
      <ModalBody>
        <Form
          form={form}
          initialValues={event}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={onClose}
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
