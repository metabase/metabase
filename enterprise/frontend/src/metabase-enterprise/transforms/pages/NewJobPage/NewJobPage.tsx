import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import type { ScheduleDisplayType, TransformTagId } from "metabase-types/api";

import { JobEditor, type TransformJobInfo } from "../../components/JobEditor";

type NewJobPageProps = {
  route: Route;
};

export function NewJobPage({ route }: NewJobPageProps) {
  const initialJob = useMemo(() => getNewJobInfo(), []);
  const [job, setJob] = useState(initialJob);
  const isDirty = useMemo(() => !_.isEqual(job, initialJob), [job, initialJob]);

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
    <>
      <JobEditor
        job={job}
        onNameChange={handleNameChange}
        onScheduleChange={handleScheduleChange}
        onTagListChange={handleTagListChange}
      />
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty} />
    </>
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
