import { memo } from "react";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import * as Urls from "metabase/urls";

import { isTransformsMainRoute } from "./utils";

type TransformsHeaderProps = {
  showMetabotButton?: boolean;
  showTabs?: boolean;
};

export const TransformsHeader = memo(function TransformsHeader({
  showMetabotButton,
  showTabs = true,
}: TransformsHeaderProps) {
  const tabs: PaneHeaderTab[] = [
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
      isSelected: (pathname) => pathname.startsWith(Urls.transformJobList()),
    },
    {
      label: t`Runs`,
      to: Urls.transformRunList(),
      icon: "play_outlined",
      isSelected: (pathname) => pathname.startsWith(Urls.transformRunList()),
    },
  ];

  return (
    <PaneHeader
      data-testid="transforms-section-header"
      breadcrumbs={
        <DataStudioBreadcrumbs>{t`Data transformation`}</DataStudioBreadcrumbs>
      }
      tabs={showTabs ? <PaneHeaderTabs tabs={tabs} /> : undefined}
      py={0}
      mb="md"
      showMetabotButton={showMetabotButton}
    />
  );
});
