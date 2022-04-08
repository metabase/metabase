import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import ModalFooter from "metabase/timelines/common/components/ModalFooter";
import { Collection, Timeline } from "metabase-types/api";

export interface DeleteTimelineModalProps {
  timeline: Timeline;
  collection: Collection;
  onSubmit: (timeline: Timeline, collection: Collection) => void;
  onCancel: () => void;
  onClose: () => void;
}

const DeleteTimelineModal = ({
  timeline,
  collection,
  onSubmit,
  onCancel,
  onClose,
}: DeleteTimelineModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(timeline, collection);
  }, [timeline, collection, onSubmit]);

  return (
    <div>
      <ModalHeader title={t`Delete ${timeline?.name}?`} onClose={onClose} />
      <ModalFooter hasPadding>
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button danger onClick={handleSubmit}>{t`Delete`}</Button>
      </ModalFooter>
    </div>
  );
};

export default DeleteTimelineModal;
