import type { ReactNode } from "react";

import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Stack } from "metabase/ui";
import type { ScheduleDisplayType, TransformTagId } from "metabase-types/api";

import { JobHeader } from "../JobHeader";

import { ScheduleSection } from "./ScheduleSection";
import { TagSection } from "./TagSection";
import { TransformsSection } from "./TransformsSection";
import type { TransformJobInfo } from "./types";

type JobEditorProps = {
  job: TransformJobInfo;
  menu?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  readOnly?: boolean;
  isCheckingPermissions?: boolean;
  showMetabotButton?: boolean;
  onNameChange: (name: string) => void;
  onScheduleChange: (
    schedule: string,
    uiDisplayType: ScheduleDisplayType,
  ) => void;
  onTagListChange: (tagIds: TransformTagId[]) => void;
};

export function JobEditor({
  job,
  menu,
  actions,
  tabs,
  readOnly,
  isCheckingPermissions,
  showMetabotButton,
  onNameChange,
  onScheduleChange,
  onTagListChange,
}: JobEditorProps) {
  return (
    <PageContainer data-testid="transforms-job-editor" gap="2.5rem">
      <JobHeader
        job={job}
        menu={menu}
        actions={actions}
        tabs={tabs}
        readOnly={readOnly}
        showMetabotButton={showMetabotButton}
        onNameChange={onNameChange}
      />
      <Stack gap="3.5rem">
        <ScheduleSection
          job={job}
          readOnly={readOnly}
          isCheckingPermissions={isCheckingPermissions}
          onScheduleChange={onScheduleChange}
        />
        <TagSection
          job={job}
          readOnly={readOnly}
          onTagsChange={onTagListChange}
        />
        {job.id != null && <TransformsSection jobId={job.id} />}
      </Stack>
    </PageContainer>
  );
}
