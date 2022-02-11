import React, { useCallback } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timelines/forms";
import { Collection, Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalButton, ModalBody } from "./EditTimelineModal.styled";
import Button from "metabase/core/components/Button";

export interface EditTimelineModalProps {
  timeline: Timeline;
  collection: Collection;
  onSubmit: (values: Partial<Timeline>, collection: Collection) => void;
  onArchive: (timeline: Timeline, collection: Collection) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const EditTimelineModal = ({
  timeline,
  collection,
  onSubmit,
  onArchive,
  onCancel,
  onClose,
}: EditTimelineModalProps): JSX.Element => {
  const handleSubmit = useCallback(
    async (values: Partial<Timeline>) => {
      await onSubmit(values, collection);
    },
    [collection, onSubmit],
  );

  const handleArchive = useCallback(() => {
    onArchive(timeline, collection);
  }, [timeline, collection, onArchive]);

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
            <ModalButton borderless onClick={handleArchive}>
              {t`Archive timeline and all events`}
            </ModalButton>
          }
        />
      </ModalBody>
    </div>
  );
};

export default EditTimelineModal;
