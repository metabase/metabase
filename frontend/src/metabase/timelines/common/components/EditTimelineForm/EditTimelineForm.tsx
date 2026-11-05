import { type JSX, useCallback } from "react";

import type { Timeline, TimelineData } from "metabase-types/api";

import { TimelineForm } from "../TimelineForm";

export interface EditTimelineFormProps {
  timeline: Timeline;
  onSubmit: (values: Timeline) => void;
  onSubmitSuccess?: () => void;
  onArchive: (timeline: Timeline) => void;
  onArchiveSuccess?: () => void;
  onCancel: () => void;
}

const EditTimelineForm = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onArchive,
  onArchiveSuccess,
  onCancel,
}: EditTimelineFormProps): JSX.Element => {
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
export default EditTimelineForm;
