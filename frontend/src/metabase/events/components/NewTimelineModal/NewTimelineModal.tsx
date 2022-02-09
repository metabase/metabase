import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/event-timelines/forms";
import { Collection, EventTimeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewTimelineModal.styled";

export interface NewTimelineModalProps {
  collection: Collection;
  onSubmit: (values: Partial<EventTimeline>, collection: Collection) => void;
  onClose: () => void;
}

const NewTimelineModal = ({
  collection,
  onSubmit,
  onClose,
}: NewTimelineModalProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return { collection_id: collection.id };
  }, [collection]);

  const handleSubmit = useCallback(
    async (values: Partial<EventTimeline>) => {
      await onSubmit(values, collection);
      onClose();
    },
    [collection, onSubmit, onClose],
  );

  return (
    <div>
      <ModalHeader title={t`New event timeline`} />
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

export default NewTimelineModal;
