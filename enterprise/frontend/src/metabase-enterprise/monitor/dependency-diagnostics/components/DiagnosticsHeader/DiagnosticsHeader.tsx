import { memo } from "react";
import { t } from "ttag";

import type { PaneHeaderTab } from "metabase/common/data-studio/components/PaneHeader";
import * as Urls from "metabase/urls";
import { DiagnosticsHeader as BaseDiagnosticsHeader } from "metabase-enterprise/monitor/components";

export const DiagnosticsHeader = memo(function DiagnosticsHeader() {
  const tabs: PaneHeaderTab[] = [
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
    <BaseDiagnosticsHeader title={t`Dependency diagnostics`} tabs={tabs} />
  );
});
