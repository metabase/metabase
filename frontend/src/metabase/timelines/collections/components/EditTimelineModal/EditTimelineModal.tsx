import React, { useCallback } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timelines/forms";
import ModalBody from "metabase/timelines/common/components/ModalBody";
import ModalDangerButton from "metabase/timelines/common/components/ModalDangerButton";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { Timeline } from "metabase-types/api";

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
          form={forms.details}
          initialValues={timeline}
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
