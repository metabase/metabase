import { memo } from "react";
import { t } from "ttag";

import {
  type MonitorHeaderTab,
  MonitorHeaderTabs,
} from "metabase/monitor/components/MonitorHeaderTabs";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

export const DiagnosticsHeader = memo(function DiagnosticsHeader() {
  const tabs: MonitorHeaderTab[] = [
    {
      label: t`Stale`,
      to: Urls.staleContent(),
      icon: "clock",
    },
    {
      label: t`Duplicated`,
      to: Urls.duplicatedContent(),
      icon: "copy",
    },
    {
      label: t`Slow`,
      to: Urls.slowContent(),
      icon: "gauge",
    },
    {
      label: t`Empty`,
      to: Urls.imbalancedContent("empty"),
      icon: "document",
    },
    {
      label: t`Sparse`,
      to: Urls.imbalancedContent("sparse"),
      icon: "list",
    },
    {
      label: t`Crowded`,
      to: Urls.imbalancedContent("crowded"),
      icon: "grid",
    },
  ];

  return (
    <Stack gap="lg">
      <MonitorHeaderTitle>{t`Content diagnostics`}</MonitorHeaderTitle>
      <MonitorHeaderTabs tabs={tabs} />
    </Stack>
  );
});
