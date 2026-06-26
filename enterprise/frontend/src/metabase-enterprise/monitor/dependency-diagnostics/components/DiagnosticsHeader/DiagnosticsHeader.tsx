import { memo } from "react";
import { t } from "ttag";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import { Stack, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

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
    <Stack gap="md">
      <Title order={1}>{t`Dependency diagnostics`}</Title>
      <PaneHeaderTabs tabs={tabs} />
    </Stack>
  );
});
