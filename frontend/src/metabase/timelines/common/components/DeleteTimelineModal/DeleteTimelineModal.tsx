import { useCallback } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button/Button";
import type { Timeline } from "metabase-types/api";

import ModalFooter from "../ModalFooter";
import ModalHeader from "../ModalHeader";

export interface DeleteTimelineModalProps {
  timeline: Timeline;
  onSubmit: (timeline: Timeline) => void;
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const DeleteTimelineModal = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onCancel,
  onClose,
}: DeleteTimelineModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(timeline);
    onSubmitSuccess?.();
  }, [timeline, onSubmit, onSubmitSuccess]);

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteTimelineModal;
