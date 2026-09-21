import { memo } from "react";
import { t } from "ttag";

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
    <Stack gap="xl">
      <MonitorHeaderTitle>{t`Dependency diagnostics`}</MonitorHeaderTitle>
      <PillTabNavigation tabs={tabs} />
    </Stack>
  );
});
