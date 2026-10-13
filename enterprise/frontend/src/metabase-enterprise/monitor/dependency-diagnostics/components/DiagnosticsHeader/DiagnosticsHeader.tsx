import { memo } from "react";
import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
  getTabCount,
} from "metabase/common/components/PillTabNavigation";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { dependencyApi } from "metabase-enterprise/api/dependencies";

export const DiagnosticsHeader = memo(function DiagnosticsHeader() {
  const { currentData: counts, isError } =
    dependencyApi.endpoints.getDependencyCounts.useQueryState(undefined);
  const tabs: PillTab[] = [
    {
      label: t`Broken dependencies`,
      to: Urls.brokenDependencies(),
      icon: "broken_link",
      count: getTabCount({ value: counts?.breaking, isError }),
    },
    {
      label: t`Unreferenced entities`,
      to: Urls.unreferencedDependencies(),
      icon: "unreferenced",
      count: getTabCount({ value: counts?.unreferenced, isError }),
    },
  ];

  return (
    <Stack gap="xl">
      <MonitorHeaderTitle>{t`Dependency diagnostics`}</MonitorHeaderTitle>
      <PillTabNavigation tabs={tabs} />
    </Stack>
  );
});
