import { useCallback } from "react";
import { t } from "ttag";

import type {
  Timeline,
  TimelineEvent,
  TimelineEventData,
} from "metabase-types/api";

import EventForm from "../../containers/EventForm";
import ModalBody from "../ModalBody";
import ModalHeader from "../ModalHeader";

export interface EditEventModalProps {
  event: TimelineEvent;
  timeline?: Timeline;
  onSubmit: (event: TimelineEvent, timeline?: Timeline) => void;
  onSubmitSuccess?: () => void;
  onArchive: (event: TimelineEvent, timeline?: Timeline) => void;
  onArchiveSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const EditEventModal = ({
  event,
  timeline,
  onSubmit,
  onSubmitSuccess,
  onArchive,
  onArchiveSuccess,
  onCancel,
  onClose,
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
    <div>
      <ModalHeader title={t`Edit event`} onClose={onClose} />
      <ModalBody>
        <EventForm
          initialValues={event}
          onSubmit={handleSubmit}
          onArchive={handleArchive}
          onCancel={onCancel}
        />
      </ModalBody>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditEventModal;
