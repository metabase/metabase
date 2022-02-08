import React from "react";
import { t } from "ttag";
import EventTimeline from "metabase/entities/event-timelines";

export interface NewEventTimelineModalProps {
  onClose?: () => void;
  onSaved?: () => void;
}

const NewEventTimelineModal = ({
  onClose,
  onSaved,
}: NewEventTimelineModalProps): JSX.Element => {
  return (
    <EventTimeline.ModalForm
      form={EventTimeline.forms.create}
      title={t`New event timeline`}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
};

export default NewEventTimelineModal;
