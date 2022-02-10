import React, { useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import { Timeline, TimelineEvent } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewEventModal.styled";

export interface NewEventModalProps {
  timeline?: Timeline;
  onSubmit: (values: Partial<TimelineEvent>) => void;
  onClose: () => void;
}

const NewEventModal = ({
  timeline,
  onSubmit,
  onClose,
}: NewEventModalProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return { timeline_id: timeline?.id };
  }, [timeline]);

  return (
    <div>
      <ModalHeader title={t`New event`} onClose={onClose} />
      <ModalBody>
        <Form
          form={forms.collection}
          initialValues={initialValues}
          isModal={true}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </ModalBody>
    </div>
  );
};

export default NewEventModal;
