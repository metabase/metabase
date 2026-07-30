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
  ];

  return (
    <Stack gap="lg">
      <MonitorHeaderTitle>{t`Content diagnostics`}</MonitorHeaderTitle>
      <MonitorHeaderTabs tabs={tabs} />
    </Stack>
  );
});
