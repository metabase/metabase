import { useCallback } from "react";
import { t } from "ttag";

import {
  type TimelineModalTransitionProps,
  getTimelineModalTransitionProps,
} from "metabase/timelines/common/modal-transitions";
import { Modal } from "metabase/ui";
import type {
  Timeline,
  TimelineEvent,
  TimelineEventData,
} from "metabase-types/api";

import EventForm from "../../containers/EventForm";

export interface EditEventModalProps extends TimelineModalTransitionProps {
  event: TimelineEvent;
  timeline?: Timeline;
  onSubmit: (event: TimelineEvent, timeline?: Timeline) => void;
  onSubmitSuccess?: () => void;
  onArchive: (event: TimelineEvent, timeline?: Timeline) => void;
  onArchiveSuccess?: () => void;
  onClose: () => void;
}

const EditEventModal = ({
  event,
  timeline,
  onSubmit,
  onSubmitSuccess,
  onArchive,
  onArchiveSuccess,
  onClose,
  animated,
}: EditEventModalProps): JSX.Element => {
  const handleSubmit = useCallback(
    async (values: TimelineEventData) => {
      await onSubmit({ ...event, ...values }, timeline);
      onSubmitSuccess?.();
    },
    [event, timeline, onSubmit, onSubmitSuccess],
  );

  const handleArchive = useCallback(async () => {
    await onArchive(event, timeline);
    onArchiveSuccess?.();
  }, [event, timeline, onArchive, onArchiveSuccess]);

  return (
    <Modal
      opened
      size="lg"
      density="relaxed"
      title={t`Edit event`}
      onClose={onClose}
      {...getTimelineModalTransitionProps(animated)}
    >
      <EventForm
        initialValues={event}
        onSubmit={handleSubmit}
        onArchive={handleArchive}
        onCancel={onClose}
      />
    </Modal>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditEventModal;
