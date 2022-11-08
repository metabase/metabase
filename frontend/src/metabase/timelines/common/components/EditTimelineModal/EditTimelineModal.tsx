import React, { useCallback, useMemo } from "react";
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
  const initialValues = useMemo(() => {
    return getInitialValues(timeline);
  }, [timeline]);

  const handleSubmit = useCallback(
    async (values: TimelineData) => {
      await onSubmit(getSubmitValues(values, timeline));
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
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onArchive={handleArchive}
          onCancel={onCancel}
        />
      </ModalBody>
    </div>
  );
};

const getInitialValues = (timeline: Timeline): TimelineData => ({
  ...timeline,
  default: false,
  description: timeline.description || "",
});

const getSubmitValues = (
  values: TimelineData,
  timeline: Timeline,
): Timeline => ({
  ...timeline,
  ...values,
  description: values.description || null,
});

export default EditTimelineModal;
