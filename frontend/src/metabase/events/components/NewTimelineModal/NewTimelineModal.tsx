import React from "react";
import { t } from "ttag";
import EventTimelines from "metabase/entities/event-timelines";

export interface NewTimelineModalProps {
  onSaved?: () => void;
  onClose?: () => void;
}

const NewTimelineModal = ({
  onSaved,
  onClose,
}: NewTimelineModalProps): JSX.Element => {
  return (
    <EventTimelines.ModalForm
      title={t`New event timeline`}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
};

export default NewTimelineModal;
