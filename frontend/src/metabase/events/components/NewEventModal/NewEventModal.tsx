import React from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/events/forms";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewEventModal.styled";

export interface NewEventModalProps {
  onSubmit?: () => void;
  onCancel?: () => void;
}

const NewEventModal = ({
  onSubmit,
  onCancel,
}: NewEventModalProps): JSX.Element => {
  return (
    <div>
      <ModalHeader title={t`New event`} />
      <ModalBody>
        <Form
          form={forms.collection}
          isModal={true}
          onSubmit={onSubmit}
          onClose={onCancel}
        />
      </ModalBody>
    </div>
  );
};

export default NewEventModal;
