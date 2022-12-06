import React, { useCallback } from "react";
import { t } from "ttag";
import { Timeline, TimelineData } from "metabase-types/api";
import ModalBody from "../ModalBody";
import ModalHeader from "../ModalHeader";
import TimelineForm from "../TimelineForm";

export interface EditTimelineModalProps {
  timeline: Timeline;
  onSubmit: (values: Timeline) => void;
  onSubmitSuccess?: () => void;
  onArchive: (timeline: Timeline) => void;
  onArchiveSuccess?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const EditTimelineModal = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onArchive,
  onArchiveSuccess,
  onCancel,
  onClose,
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
    <div>
      <ModalHeader title={t`Edit event timeline`} onClose={onClose} />
      <ModalBody>
        <TimelineForm
          initialValues={timeline}
          onSubmit={handleSubmit}
          onArchive={handleArchive}
          onCancel={onCancel}
        />
      </ModalBody>
    </div>
  );
};

export default EditTimelineModal;
