import { useCallback } from "react";

import type {
  Timeline,
  TimelineEvent,
  TimelineEventData,
} from "metabase-types/api";

import EventForm from "../../containers/EventForm";

export interface EditEventModalProps {
  event: TimelineEvent;
  timeline?: Timeline;
  onSubmit: (event: TimelineEvent, timeline?: Timeline) => void;
  onSubmitSuccess?: () => void;
  onArchive: (event: TimelineEvent, timeline?: Timeline) => void;
  onArchiveSuccess?: () => void;
  onCancel: () => void;
}

const EditEventModal = ({
  event,
  timeline,
  onSubmit,
  onSubmitSuccess,
  onArchive,
  onArchiveSuccess,
  onCancel,
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
    <EventForm
      initialValues={event}
      onSubmit={handleSubmit}
      onArchive={handleArchive}
      onCancel={onCancel}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditEventModal;
