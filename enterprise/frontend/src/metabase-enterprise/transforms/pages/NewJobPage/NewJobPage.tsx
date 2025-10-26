import { useState } from "react";
import { t } from "ttag";

import type { ScheduleDisplayType, TransformTagId } from "metabase-types/api";

import { JobEditor, type TransformJobInfo } from "../../components/JobEditor";

export function NewJobPage() {
  const [job, setJob] = useState(() => getNewJobInfo());

  const handleNameChange = (name: string) => {
    setJob({ ...job, name });
  };

  const handleScheduleChange = (
    schedule: string,
    uiDisplayType: ScheduleDisplayType,
  ) => {
    setJob({ ...job, schedule, ui_display_type: uiDisplayType });
  };

  const handleTagListChange = (tagIds: TransformTagId[]) => {
    setJob({ ...job, tag_ids: tagIds });
  };

  return (
    <JobEditor
      job={job}
      onNameChange={handleNameChange}
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
    ui_display_type: "cron/builder",
    tag_ids: [],
  };
}
