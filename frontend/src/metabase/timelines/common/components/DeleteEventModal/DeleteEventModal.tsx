import { useCallback } from "react";
import { t } from "ttag";

import {
  type TimelineModalTransitionProps,
  getTimelineModalTransitionProps,
} from "metabase/timelines/common/modal-transitions";
import { Button, Modal } from "metabase/ui";
import type { TimelineEvent } from "metabase-types/api";

export interface DeleteEventModalProps extends TimelineModalTransitionProps {
  event: TimelineEvent;
  onSubmit: (event: TimelineEvent) => void;
  onSubmitSuccess?: () => void;
  onClose: () => void;
}

const DeleteEventModal = ({
  event,
  onSubmit,
  onSubmitSuccess,
  onClose,
  animated,
}: DeleteEventModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(event);
    onSubmitSuccess?.();
  }, [event, onSubmit, onSubmitSuccess]);

  return (
    <Modal
      opened
      size="lg"
      title={t`Delete ${event.name}?`}
      onClose={onClose}
      {...getTimelineModalTransitionProps(animated)}
    >
      <Modal.Footer>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          color="negative"
          onClick={handleSubmit}
        >{t`Delete`}</Button>
      </Modal.Footer>
    </Modal>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteEventModal;
