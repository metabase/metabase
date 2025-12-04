import type { ReactNode } from "react";

import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { ScheduleDisplayType, TransformTagId } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";
import { ColumnLayout, ColumnLayoutBody } from "../ColumnLayout";

import { DependenciesSection } from "./DependenciesSection";
import { ScheduleSection } from "./ScheduleSection";
import { TagSection } from "./TagSection";
import type { TransformJobInfo } from "./types";

type JobEditorProps = {
  job: TransformJobInfo;
  menu?: ReactNode;
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
  menu,
  actions,
  onNameChange,
  onScheduleChange,
  onTagListChange,
}: JobEditorProps) {
  return (
    <ColumnLayout data-testid="jobs-editor">
      <PaneHeader
        title={
          <PaneHeaderInput
            initialValue={job.name}
            maxLength={NAME_MAX_LENGTH}
            onChange={onNameChange}
          />
        }
        menu={menu}
        actions={actions}
        data-testid="jobs-header"
      />
      <ColumnLayoutBody>
        <ScheduleSection job={job} onScheduleChange={onScheduleChange} />
        <TagSection job={job} onTagsChange={onTagListChange} />
        {job.id != null && <DependenciesSection jobId={job.id} />}
      </ColumnLayoutBody>
    </ColumnLayout>
  );
}
