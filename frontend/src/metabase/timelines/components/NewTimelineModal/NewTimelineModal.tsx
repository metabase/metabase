import React, { useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timelines/forms";
import { Collection, Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewTimelineModal.styled";

export interface NewTimelineModalProps {
  collection: Collection;
  onSubmit: (values: Partial<Timeline>) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const NewTimelineModal = ({
  collection,
  onSubmit,
  onCancel,
  onClose,
}: NewTimelineModalProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return { collection_id: collection.id };
  }, [collection]);

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
