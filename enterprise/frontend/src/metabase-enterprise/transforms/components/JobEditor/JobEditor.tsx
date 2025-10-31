import type { ReactNode } from "react";

import { BenchHeader } from "metabase/bench/components/BenchHeader";
import { BenchNameInput } from "metabase/bench/components/BenchNameInput";
import type { ScheduleDisplayType, TransformTagId } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";
import { ColumnLayout, ColumnLayoutBody } from "../ColumnLayout";

import { DependenciesSection } from "./DependenciesSection";
import { ScheduleSection } from "./ScheduleSection";
import { TagSection } from "./TagSection";
import type { TransformJobInfo } from "./types";

type JobEditorProps = {
  job: TransformJobInfo;
  actions?: ReactNode;
  onNameChange: (name: string) => void;
  onScheduleChange: (
    schedule: string,
    uiDisplayType: ScheduleDisplayType,
  ) => void;
  onTagListChange: (tagIds: TransformTagId[]) => void;
};

export function JobEditor({
  job,
  actions,
  onNameChange,
  onScheduleChange,
  onTagListChange,
}: JobEditorProps) {
  return (
    <ColumnLayout>
      <BenchHeader
        title={
          <BenchNameInput
            initialValue={job.name}
            maxLength={NAME_MAX_LENGTH}
            onChange={onNameChange}
          />
        }
        actions={actions}
      />
      <ColumnLayoutBody>
        <ScheduleSection job={job} onScheduleChange={onScheduleChange} />
        <TagSection job={job} onTagsChange={onTagListChange} />
        {job.id != null && <DependenciesSection jobId={job.id} />}
      </ColumnLayoutBody>
    </ColumnLayout>
  );
}
