import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timelines/forms";
import { canonicalCollectionId } from "metabase/collections/utils";
import { Collection, Timeline } from "metabase-types/api";
import ModalHeader from "../ModalHeader";
import { ModalBody } from "./NewTimelineModal.styled";

export interface NewTimelineModalProps {
  collection: Collection;
  onSubmit: (values: Partial<Timeline>, collection: Collection) => void;
  onChangeLocation: (location: string) => void;
  onClose?: () => void;
}

const NewTimelineModal = ({
  collection,
  onSubmit,
  onChangeLocation,
  onClose,
}: NewTimelineModalProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return { collection_id: canonicalCollectionId(collection.id) };
  }, [collection]);

  const handleSubmit = useCallback(
    (values: Partial<Timeline>) => {
      onSubmit(values, collection);
    },
    [collection, onSubmit],
  );

  const handleCancel = useCallback(() => {
    onChangeLocation(Urls.timelinesInCollection(collection));
  }, [collection, onChangeLocation]);

  return (
    <div>
      <ModalHeader title={t`New event timeline`} onClose={onClose} />
      <ModalBody>
        <Form
          form={forms.collection}
          initialValues={initialValues}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={handleCancel}
        />
      </ModalBody>
    </div>
  );
};

export default NewTimelineModal;
