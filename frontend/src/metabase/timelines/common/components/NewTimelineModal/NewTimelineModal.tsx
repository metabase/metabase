import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timelines/forms";
import { getDefaultTimelineIcon } from "metabase/lib/timelines";
import { canonicalCollectionId } from "metabase/collections/utils";
import { Collection, Timeline } from "metabase-types/api";
import ModalBody from "../ModalBody";
import ModalHeader from "../ModalHeader";

export interface NewTimelineModalProps {
  collection: Collection;
  onSubmit: (values: Partial<Timeline>, collection: Collection) => void;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const NewTimelineModal = ({
  collection,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: NewTimelineModalProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return {
      collection_id: canonicalCollectionId(collection.id),
      icon: getDefaultTimelineIcon(),
      default: false,
    };
  }, [collection]);

  const handleSubmit = useCallback(
    async (values: Partial<Timeline>) => {
      await onSubmit(values, collection);
      onSubmitSuccess?.();
    },
    [collection, onSubmit, onSubmitSuccess],
  );

  return (
    <div>
      <ModalHeader title={t`New event timeline`} onClose={onClose} />
      <ModalBody>
        <Form
          form={forms.details}
          initialValues={initialValues}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={onCancel}
        />
      </ModalBody>
    </div>
  );
};

export default NewTimelineModal;
