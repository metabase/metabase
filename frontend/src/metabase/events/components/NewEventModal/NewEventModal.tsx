import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import { Collection, TimelineEvent, Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewEventModal.styled";

export interface NewEventModalProps {
  collection: Collection;
  timeline?: Timeline;
  onSubmit: (values: Partial<TimelineEvent>, collection: Collection) => void;
  onClose: () => void;
}

const NewEventModal = ({
  collection,
  timeline,
  onSubmit,
  onClose,
}: NewEventModalProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return { timeline_id: timeline?.id };
  }, [timeline]);

  const handleSubmit = useCallback(
    async (values: Partial<TimelineEvent>) => {
      await onSubmit(values, collection);
      onClose();
    },
    [collection, onSubmit, onClose],
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
