import { useCallback } from "react";
import { t } from "ttag";

import {
  type TimelineModalTransitionProps,
  getTimelineModalTransitionProps,
} from "metabase/timelines/common/modal-transitions";
import { Button, Modal } from "metabase/ui";
import type { Timeline } from "metabase-types/api";

export interface DeleteTimelineModalProps extends TimelineModalTransitionProps {
  timeline: Timeline;
  onSubmit: (timeline: Timeline) => void;
  onSubmitSuccess?: () => void;
  onClose: () => void;
}

const DeleteTimelineModal = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onClose,
  animated,
}: DeleteTimelineModalProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(timeline);
    onSubmitSuccess?.();
  }, [timeline, onSubmit, onSubmitSuccess]);

  return (
    <Modal
      opened
      size="lg"
      title={t`Delete ${timeline.name}?`}
      onClose={onClose}
      {...getTimelineModalTransitionProps(animated)}
    >
      <Modal.Footer>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button variant="filled" color="negative" onClick={handleSubmit}>
          {t`Delete`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteTimelineModal;
