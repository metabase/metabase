import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewEventModal.styled";

export interface NewEventModalProps {
  timeline?: Timeline;
  collection: Collection;
  onSubmit: (values: Partial<TimelineEvent>, collection: Collection) => void;
  onClose: () => void;
}

const NewEventModal = ({
  timeline,
  collection,
  onSubmit,
  onClose,
}: NewEventModalProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return { timeline_id: timeline?.id };
  }, [timeline]);

  const handleSubmit = useCallback(
    (values: Partial<TimelineEvent>) => {
      return onSubmit(values, collection);
    },
    [collection, onSubmit],
  );

  return (
    <div>
      <ModalHeader title={t`New event`} onClose={onClose} />
      <ModalBody>
        <Form
          form={forms.collection}
          initialValues={initialValues}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={onClose}
        />
      </ModalBody>
    </div>
  );
};

export default NewEventModal;
