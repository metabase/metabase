import type { ReactNode } from "react";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { useSetting } from "metabase/common/hooks";
import { Link } from "metabase/router";
import { Group } from "metabase/ui";
import * as Urls from "metabase/urls";

import { NAME_MAX_LENGTH } from "../../constants";
import type { TransformJobInfo } from "../JobEditor/types";
import { LockedTransformsHoverCard } from "../LockedTransformsHoverCard/LockedTransformsHoverCard";
import { TransformBadge } from "../TransformBadge/TransformBadge";

type JobHeaderProps = {
  job: TransformJobInfo;
  menu?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  readOnly?: boolean;
  showMetabotButton?: boolean;
  onNameChange: (name: string) => void;
};

export function JobHeader({
  job,
  menu,
  actions,
  tabs,
  readOnly,
  showMetabotButton,
  onNameChange,
}: JobHeaderProps) {
  const isMeterLocked = useSetting("transforms-meter-locked");

  return (
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
      showMetabotButton={showMetabotButton}
      data-testid="jobs-header"
    />
  );
}
