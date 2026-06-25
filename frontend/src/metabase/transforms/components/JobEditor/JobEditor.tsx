import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { useSetting } from "metabase/common/hooks";
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
  tabs?: ReactNode;
  readOnly?: boolean;
  isCheckingPermissions?: boolean;
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
                <TransformBadge bg="background_surface-warning-strong">{t`Disabled`}</TransformBadge>
              </LockedTransformsHoverCard>
            )}
            {!isMeterLocked && !job.active && (
              <TransformBadge bg="background_surface-warning-strong">
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
        tabs={tabs}
        data-testid="jobs-header"
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
