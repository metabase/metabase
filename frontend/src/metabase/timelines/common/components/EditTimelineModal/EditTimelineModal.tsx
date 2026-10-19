import { useCallback } from "react";
import { t } from "ttag";

import {
  type TimelineModalTransitionProps,
  getTimelineModalTransitionProps,
} from "metabase/timelines/common/modal-transitions";
import { Modal } from "metabase/ui";
import type { Timeline, TimelineData } from "metabase-types/api";

import { TimelineForm } from "../TimelineForm";

export interface EditTimelineModalProps extends TimelineModalTransitionProps {
  timeline: Timeline;
  onSubmit: (values: Timeline) => void;
  onSubmitSuccess?: () => void;
  onArchive: (timeline: Timeline) => void;
  onArchiveSuccess?: () => void;
  onClose: () => void;
}

const EditTimelineModal = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onArchive,
  onArchiveSuccess,
  onClose,
  animated,
}: EditTimelineModalProps): JSX.Element => {
  const handleSubmit = useCallback(
    async (values: TimelineData) => {
      await onSubmit({ ...timeline, ...values, default: false });
      onSubmitSuccess?.();
    },
    [timeline, onSubmit, onSubmitSuccess],
  );

  const handleArchive = useCallback(async () => {
    await onArchive(timeline);
    onArchiveSuccess?.();
  }, [timeline, onArchive, onArchiveSuccess]);

  return (
    <Modal
      opened
      size="lg"
      density="relaxed"
      title={t`Edit event timeline`}
      onClose={onClose}
      {...getTimelineModalTransitionProps(animated)}
    >
      <TimelineForm
        initialValues={timeline}
        onSubmit={handleSubmit}
        onArchive={handleArchive}
        onCancel={onClose}
      />
    </Modal>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditTimelineModal;
