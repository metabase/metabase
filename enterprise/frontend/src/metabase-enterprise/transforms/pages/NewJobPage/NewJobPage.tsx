import { useState } from "react";
import { t } from "ttag";

import type { ScheduleDisplayType, TransformTagId } from "metabase-types/api";

import { JobView, type TransformJobInfo } from "../../components/JobView";

export function NewJobPage() {
  const [job, setJob] = useState(() => getNewJobInfo());

  const handleNameChange = (name: string) => {
    setJob({ ...job, name });
  };

  const handleDescriptionChange = (description: string | null) => {
    setJob({ ...job, description });
  };

  const handleScheduleChange = (
    schedule: string,
    scheduleDisplayType: ScheduleDisplayType,
  ) => {
    setJob({ ...job, schedule, schedule_display_type: scheduleDisplayType });
  };

  const handleTagListChange = (tagIds: TransformTagId[]) => {
    setJob({ ...job, tag_ids: tagIds });
  };

  return (
    <JobView
      job={job}
      onNameChange={handleNameChange}
      onDescriptionChange={handleDescriptionChange}
      onScheduleChange={handleScheduleChange}
      onTagListChange={handleTagListChange}
    />
  );
}

function getNewJobInfo(): TransformJobInfo {
  return {
    name: t`New job`,
    description: null,
    schedule: "0 0 0 * * ? *",
    schedule_display_type: "cron/builder",
    tag_ids: [],
  };
}
