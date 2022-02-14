import React, { useCallback } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timelines/forms";
import { Collection, Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./EditTimelineModal.styled";

export interface EditTimelineModalProps {
  timeline: Timeline;
  collection: Collection;
  onSubmit: (values: Partial<Timeline>, collection: Collection) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const EditTimelineModal = ({
  timeline,
  collection,
  onSubmit,
  onCancel,
  onClose,
}: EditTimelineModalProps): JSX.Element => {
  const handleSubmit = useCallback(
    async (values: Partial<Timeline>) => {
      await onSubmit(values, collection);
    },
    [collection, onSubmit],
  );

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
        />
      </ModalBody>
    </div>
  );
};

export default EditTimelineModal;
