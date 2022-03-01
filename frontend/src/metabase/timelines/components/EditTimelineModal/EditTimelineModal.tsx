import React, { useCallback } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timelines/forms";
import { Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody, ModalDangerButton } from "./EditTimelineModal.styled";

export interface EditTimelineModalProps {
  timeline: Timeline;
  onSubmit: (values: Partial<Timeline>) => void;
  onArchive: (timeline: Timeline) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const EditTimelineModal = ({
  timeline,
  onSubmit,
  onArchive,
  onCancel,
  onClose,
}: EditTimelineModalProps): JSX.Element => {
  const handleSubmit = useCallback(
    async (values: Partial<Timeline>) => {
      await onSubmit(values);
    },
    [onSubmit],
  );

  const handleArchive = useCallback(async () => {
    await onArchive(timeline);
  }, [timeline, onArchive]);

  return (
    <div>
      <ModalHeader title={t`Edit event timeline`} onClose={onClose} />
      <ModalBody>
        <Form
          form={forms.collection}
          initialValues={timeline}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={onCancel}
          footerExtraButtons={
            <ModalDangerButton type="button" borderless onClick={handleArchive}>
              {t`Archive timeline and all events`}
            </ModalDangerButton>
          }
        />
      </ModalBody>
    </div>
  );
};

export default EditTimelineModal;
