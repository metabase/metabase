import { Stack } from "metabase/ui";
import { ReadOnlyNotice } from "metabase-enterprise/git_sync/ReadOnlyNotice";
import { useIsInLibrary } from "metabase-enterprise/git_sync/useIsInLibrary";
import type { TransformTagId } from "metabase-types/api";

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
  onScheduleChange: (schedule: string) => void;
  onTagListChange: (tagIds: TransformTagId[]) => void;
};

export function JobView({
  job,
  onNameChange,
  onDescriptionChange,
  onScheduleChange,
  onTagListChange,
}: JobPageProps) {
  const isInLibrary = useIsInLibrary("transform");
  const isNewJob = job.id == null;

  const readOnly = isInLibrary && !isNewJob;

  return (
    <Stack gap="3.5rem" data-testid="job-view">
      <Stack gap="lg">
        <HeaderSection job={job} />
        <NameSection
          job={job}
          onNameChange={onNameChange}
          onDescriptionChange={onDescriptionChange}
        />
        {readOnly && <ReadOnlyNotice />}
      </Stack>
      <ScheduleSection job={job} onScheduleChange={onScheduleChange} disabled={readOnly} />
      <TagSection job={job} onTagsChange={onTagListChange} disabled={readOnly} />
      {!isNewJob && !readOnly && <ManageSection job={job} />}
      {isNewJob && <SaveSection job={job} />}
    </Stack>
  );
}
