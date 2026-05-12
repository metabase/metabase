import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import { Group, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ScheduleDisplayType, TransformTagId } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../constants";
import { LockedTransformsHoverCard } from "../LockedTransformsHoverCard/LockedTransformsHoverCard";
import { TransformBadge } from "../TransformBadge/TransformBadge";

import { ScheduleSection } from "./ScheduleSection";
import { TagSection } from "./TagSection";
import { TransformsSection } from "./TransformsSection";
import type { TransformJobInfo } from "./types";

type JobEditorProps = {
  job: TransformJobInfo;
  menu?: ReactNode;
  actions?: ReactNode;
  readOnly?: boolean;
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
  readOnly,
  onNameChange,
  onScheduleChange,
  onTagListChange,
}: JobEditorProps) {
  const isMeterLocked = useSetting("transforms-meter-locked");

  return (
    <PageContainer data-testid="transforms-job-editor" gap="2.5rem">
      <PaneHeader
        title={
          <Group align="center" gap="sm" wrap="nowrap">
            <PaneHeaderInput
              initialValue={job.name}
              maxLength={NAME_MAX_LENGTH}
              onChange={onNameChange}
              readOnly={readOnly}
            />
            {isMeterLocked && (
              <LockedTransformsHoverCard>
                <TransformBadge bg="background-warning-secondary">{t`Disabled`}</TransformBadge>
              </LockedTransformsHoverCard>
            )}
            {!isMeterLocked && !job.active && (
              <TransformBadge bg="background-warning-secondary">
                {t`Disabled`}
              </TransformBadge>
            )}
          </Group>
        }
        py={0}
        breadcrumbs={
          <DataStudioBreadcrumbs>
            <Link key="transform-job-list" to={Urls.transformJobList()}>
              {t`Jobs`}
            </Link>
            {job.name}
          </DataStudioBreadcrumbs>
        }
        menu={menu}
        actions={actions}
        data-testid="jobs-header"
      />
      <Stack gap="3.5rem">
        <ScheduleSection
          job={job}
          readOnly={readOnly}
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
