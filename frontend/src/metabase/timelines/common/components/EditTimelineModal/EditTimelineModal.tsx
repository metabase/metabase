import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timelines/forms";
import { Timeline } from "metabase-types/api";
import ModalBody from "../ModalBody";
import ModalDangerButton from "../ModalDangerButton";
import ModalHeader from "../ModalHeader";

export interface EditTimelineModalProps {
  timeline: Timeline;
  onSubmit: (values: Partial<Timeline>) => void;
  onSubmitSuccess?: () => void;
  onArchive: (timeline: Timeline) => void;
  onArchiveSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const EditTimelineModal = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onArchive,
  onArchiveSuccess,
  onCancel,
  onClose,
}: EditTimelineModalProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return { ...timeline, default: false };
  }, [timeline]);

  const handleSubmit = useCallback(
    async (values: Partial<Timeline>) => {
      await onSubmit(values);
      onSubmitSuccess?.();
    },
    [onSubmit, onSubmitSuccess],
  );

  const handleArchive = useCallback(async () => {
    await onArchive(timeline);
    onArchiveSuccess?.();
  }, [timeline, onArchive, onArchiveSuccess]);

  return (
    <div>
      <ModalHeader title={t`Edit event timeline`} onClose={onClose} />
      <ModalBody>
        <Form
          form={forms.details}
          initialValues={initialValues}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={onCancel}
          footerExtraButtons={
            <ModalDangerButton onClick={handleArchive}>
              {t`Archive timeline and all events`}
            </ModalDangerButton>
          }
        />
      </ModalBody>
    </div>
  );
};

export default EditTimelineModal;
