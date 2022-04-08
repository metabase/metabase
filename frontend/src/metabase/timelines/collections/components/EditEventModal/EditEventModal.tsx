import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import forms from "metabase/entities/timeline-events/forms";
import ModalBody from "metabase/timelines/common/components/ModalBody";
import ModalDangerButton from "metabase/timelines/common/components/ModalDangerButton";
import ModalHeader from "metabase/timelines/common/components/ModalHeader";
import { Timeline, TimelineEvent } from "metabase-types/api";

export interface EditEventModalProps {
  event: TimelineEvent;
  timeline: Timeline;
  onSubmit: (event: TimelineEvent, timeline: Timeline) => void;
  onArchive: (event: TimelineEvent, timeline: Timeline) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const EditEventModal = ({
  event,
  timeline,
  onSubmit,
  onArchive,
  onCancel,
  onClose,
}: EditEventModalProps): JSX.Element => {
  const form = useMemo(() => forms.details(), []);

  const handleSubmit = useCallback(
    async (event: TimelineEvent) => {
      await onSubmit(event, timeline);
    },
    [timeline, onSubmit],
  );

  const handleArchive = useCallback(async () => {
    await onArchive(event, timeline);
  }, [event, timeline, onArchive]);

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
            <ModalDangerButton onClick={handleArchive}>
              {t`Archive event`}
            </ModalDangerButton>
          }
        />
      </ModalBody>
    </div>
  );
};

export default EditEventModal;
