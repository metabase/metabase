import { memo } from "react";
import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
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
      tabs={showTabs ? <PillTabNavigation tabs={tabs} /> : undefined}
      py={0}
      mb="lg"
      showMetabotButton={showMetabotButton}
    />
  );
});
