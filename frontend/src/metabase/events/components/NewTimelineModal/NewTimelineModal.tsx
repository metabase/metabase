import React from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/event-timelines/forms";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewTimelineModal.styled";

export interface NewTimelineModalProps {
  onSubmit?: () => void;
  onCancel?: () => void;
}

const NewTimelineModal = ({
  onSubmit,
  onCancel,
}: NewTimelineModalProps): JSX.Element => {
  return (
    <div>
      <ModalHeader title={t`New event timeline`} />
      <ModalBody>
        <Form
          form={forms.create}
          isModal={true}
          onSubmit={onSubmit}
          onClose={onCancel}
        />
      </ModalBody>
    </div>
  );
};

export default NewTimelineModal;
