import { memo } from "react";
import { c, t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

export const DiagnosticsHeader = memo(function DiagnosticsHeader() {
  const tabs: PillTab[] = [
    {
      label: c("Navigation tab for content that hasn't been used recently")
        .t`Stale`,
      to: Urls.staleContent(),
      icon: "clock",
    },
    {
      label: c("Navigation tab for duplicated content").t`Duplicated`,
      to: Urls.duplicatedContent(),
      icon: "copy",
    },
    {
      label: c("Navigation tab for slow-loading content").t`Slow`,
      to: Urls.slowContent(),
      icon: "gauge",
    },
    {
      label: c(
        "Navigation tab for empty content, e.g. a collection with no items",
      ).t`Empty`,
      to: Urls.imbalancedContent("empty"),
      icon: "unreferenced",
    },
    {
      label: c("Navigation tab for content with very few items").t`Sparse`,
      to: Urls.imbalancedContent("sparse"),
      icon: "layout_grid",
    },
    {
      label: c("Navigation tab for content with too many items").t`Crowded`,
      to: Urls.imbalancedContent("crowded"),
      icon: "grid_bordered",
    },
  ];

  return (
    <Stack gap="lg">
      <MonitorHeaderTitle>{t`Content diagnostics`}</MonitorHeaderTitle>
      <PillTabNavigation tabs={tabs} />
    </Stack>
  );
});
