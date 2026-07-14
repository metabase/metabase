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
      label: t`Broken dependencies`,
      to: Urls.brokenDependencies(),
      icon: "broken_link",
    },
    {
      label: t`Unreferenced entities`,
      to: Urls.unreferencedDependencies(),
      icon: "unreferenced",
    },
  ];

  return (
    <Stack gap="lg">
      <MonitorHeaderTitle>{t`Dependency diagnostics`}</MonitorHeaderTitle>
      <MonitorHeaderTabs tabs={tabs} />
    </Stack>
  );
});
