import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { Collection, Timeline, TimelineEvent } from "metabase-types/api";
import { ModalBody, ModalDangerButton } from "./EditEventModal.styled";

export interface EditEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  collection: Collection;
  onSubmit: (
    event: TimelineEvent,
    timeline: Timeline,
    collection: Collection,
  ) => void;
  onArchive: (
    event: TimelineEvent,
    timeline: Timeline,
    collection: Collection,
  ) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const EditEventModal = ({
  event,
  timeline,
  collection,
  onSubmit,
  onArchive,
  onCancel,
  onClose,
}: EditEventModalProps): JSX.Element => {
  const form = useMemo(() => forms.details(), []);

  const handleSubmit = useCallback(
    async (event: TimelineEvent) => {
      await onSubmit(event, timeline, collection);
    },
    [timeline, collection, onSubmit],
  );

  const handleArchive = useCallback(async () => {
    await onArchive(event, timeline, collection);
  }, [event, timeline, collection, onArchive]);

  return (
    <div>
      <ModalHeader title={t`Edit event`} onClose={onClose} />
      <ModalBody>
        <Form
          form={form}
          initialValues={event}
          isModal={true}
          onSubmit={handleSubmit}
          onClose={onCancel}
          footerExtraButtons={
            <ModalDangerButton type="button" borderless onClick={handleArchive}>
              {t`Archive event`}
            </ModalDangerButton>
          }
        />
      </ModalBody>
    </div>
  );
};

export default EditEventModal;
