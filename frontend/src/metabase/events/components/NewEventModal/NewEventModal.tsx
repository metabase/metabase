import React from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/events/forms";
import { Event, EventTimeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewEventModal.styled";

export interface NewEventModalProps {
  timeline?: EventTimeline;
  onSubmit: (values: Partial<Event>) => void;
  onCancel: () => void;
}

const NewEventModal = ({
  timeline,
  onSubmit,
  onCancel,
}: NewEventModalProps): JSX.Element => {
  const initialValues = { timeline_id: timeline?.id };

  return (
    <div>
      <ModalHeader title={t`New event`} />
      <ModalBody>
        <Form
          form={forms.collection}
          initialValues={initialValues}
          isModal={true}
          onSubmit={onSubmit}
          onClose={onCancel}
        />
      </ModalBody>
    </div>
  );
};

export default NewEventModal;
