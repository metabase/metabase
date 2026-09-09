import { memo } from "react";
import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useWorktreeId } from "metabase/common/worktrees";
import * as Urls from "metabase/urls";

import {
  isTransformsJobsRoute,
  isTransformsMainRoute,
  isTransformsRunsRoute,
} from "./utils";

type TransformsHeaderProps = {
  showMetabotButton?: boolean;
  showTabs?: boolean;
};

export const TransformsHeader = memo(function TransformsHeader({
  showMetabotButton,
  showTabs = true,
}: TransformsHeaderProps) {
  // A worktree only checks out transforms: its jobs never run and there is no run
  // history, so the section has nothing to switch between.
  const isInsideWorktree = useWorktreeId() != null;
  const hasTabs = showTabs && !isInsideWorktree;
  const tabs: PillTab[] = [
    {
      label: t`Transforms`,
      to: Urls.transformList(),
      icon: "transform",
      isSelected: isTransformsMainRoute,
    },
    {
      label: t`Jobs`,
      to: Urls.transformJobList(),
      icon: "clock",
      isSelected: isTransformsJobsRoute,
    },
    {
      label: t`Runs`,
      to: Urls.transformGraphRunList(),
      icon: "play_outlined",
      isSelected: isTransformsRunsRoute,
    },
  ];

  return (
    <PaneHeader
      data-testid="transforms-section-header"
      breadcrumbs={
        <DataStudioBreadcrumbs>{t`Data transformation`}</DataStudioBreadcrumbs>
      }
      tabs={hasTabs ? <PillTabNavigation tabs={tabs} /> : undefined}
      py={0}
      // the margin separates the tab row from the content; without tabs the
      // header should sit as tight as the other Data Studio sections
      mb={hasTabs ? "lg" : 0}
      showMetabotButton={showMetabotButton}
    />
  );
});
