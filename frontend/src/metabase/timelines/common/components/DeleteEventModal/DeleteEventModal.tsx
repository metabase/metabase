import { type JSX, useCallback } from "react";
import { t } from "ttag";

import { Button, Modal } from "metabase/ui";
import type { TimelineEvent } from "metabase-types/api";

export interface DeleteEventModalProps {
  event: TimelineEvent;
  onSubmit: (event: TimelineEvent) => void;
  onSubmitSuccess?: () => void;
  onCancel: () => void;
}

const DeleteEventModal = ({
  event,
  onSubmit,
  onSubmitSuccess,
  onCancel,
}: DeleteEventModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(event);
    onSubmitSuccess?.();
  }, [event, onSubmit, onSubmitSuccess]);

  return (
    <Modal.Footer>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Button
        variant="filled"
        color="negative"
        onClick={handleSubmit}
      >{t`Delete`}</Button>
    </Modal.Footer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteEventModal;
