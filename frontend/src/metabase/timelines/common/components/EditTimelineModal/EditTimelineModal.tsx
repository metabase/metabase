import { useCallback } from "react";

import type { Timeline, TimelineData } from "metabase-types/api";

import { TimelineForm } from "../TimelineForm";

export interface EditTimelineModalProps {
  timeline: Timeline;
  onSubmit: (values: Timeline) => void;
  onSubmitSuccess?: () => void;
  onArchive: (timeline: Timeline) => void;
  onArchiveSuccess?: () => void;
  onCancel: () => void;
}

const EditTimelineModal = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onArchive,
  onArchiveSuccess,
  onCancel,
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
    <TimelineForm
      initialValues={timeline}
      onSubmit={handleSubmit}
      onArchive={handleArchive}
      onCancel={onCancel}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditTimelineModal;
