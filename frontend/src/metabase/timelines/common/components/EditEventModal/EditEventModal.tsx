import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { Timeline, TimelineEvent, TimelineEventData } from "metabase-types/api";
import EventForm from "../EventForm";
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
  const initialValues = useMemo(() => {
    return getInitialValues(event);
  }, [event]);

  const handleSubmit = useCallback(
    async (values: TimelineEventData) => {
      await onSubmit(getSubmitValues(event, values), timeline);
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
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onArchive={handleArchive}
          onCancel={onCancel}
        />
      </ModalBody>
    </div>
  );
};

const getInitialValues = (event: TimelineEvent): TimelineEventData => ({
  ...event,
  description: event.description || "",
});

const getSubmitValues = (
  event: TimelineEvent,
  values: TimelineEventData,
): TimelineEvent => ({
  ...event,
  ...values,
  description: values.description || null,
});

export default EditEventModal;
