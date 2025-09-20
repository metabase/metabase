import { Stack } from "metabase/ui";
import type { ScheduleDisplayType, TransformTagId } from "metabase-types/api";

import { DependenciesSection } from "./DependenciesSection";
import { HeaderSection } from "./HeaderSection";
import { ManageSection } from "./ManageSection";
import { NameSection } from "./NameSection";
import { SaveSection } from "./SaveSection";
import { ScheduleSection } from "./ScheduleSection";
import { TagSection } from "./TagSection";
import type { TransformJobInfo } from "./types";

type JobPageProps = {
  job: TransformJobInfo;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string | null) => void;
  onScheduleChange: (
    schedule: string,
    scheduleDisplayType: ScheduleDisplayType,
  ) => void;
  onTagListChange: (tagIds: TransformTagId[]) => void;
};

export function JobView({
  job,
  onNameChange,
  onDescriptionChange,
  onScheduleChange,
  onTagListChange,
}: JobPageProps) {
  return (
    <Stack gap="3.5rem" data-testid="job-view">
      <Stack gap="lg">
        <HeaderSection job={job} />
        <NameSection
          job={job}
          onNameChange={onNameChange}
          onDescriptionChange={onDescriptionChange}
        />
      </Stack>
      <ScheduleSection job={job} onScheduleChange={onScheduleChange} />
      <TagSection job={job} onTagsChange={onTagListChange} />
      {job.id != null && <ManageSection job={job} />}
      {job.id == null && <SaveSection job={job} />}
      {job.id != null && <DependenciesSection jobId={job.id} />}
    </Stack>
  );
}
