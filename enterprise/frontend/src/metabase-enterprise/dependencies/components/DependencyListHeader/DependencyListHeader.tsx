import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Stack, Title } from "metabase/ui";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";

export function DependencyListHeader() {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Broken`,
      to: Urls.dataStudioBrokenItems(),
      icon: "list",
    },
    {
      label: t`Unreferenced`,
      to: Urls.dataStudioUnreferencedItems(),
      icon: "list",
    },
  ];

  return (
    <Stack gap="md">
      <Title order={1} fz="sm" lh="1rem" fw="normal">{t`Tasks`}</Title>
      <PaneHeaderTabs tabs={tabs} />
    </Stack>
  );
}
