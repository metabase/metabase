import React from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/event-timelines/forms";
import { Collection, EventTimeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewTimelineModal.styled";

export interface NewTimelineModalProps {
  collection?: Collection;
  onSubmit?: (values: Partial<EventTimeline>) => void;
  onCancel?: () => void;
}

const NewTimelineModal = ({
  collection,
  onSubmit,
  onCancel,
}: NewTimelineModalProps): JSX.Element => {
  const initialValues = { collection_id: collection?.id };

  return (
    <div>
      <ModalHeader title={t`New event timeline`} />
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

export default NewTimelineModal;
