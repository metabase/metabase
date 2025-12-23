import { memo } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Stack, Title } from "metabase/ui";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";

export const ListHeader = memo(function ListHeader() {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Broken`,
      to: Urls.dataStudioBrokenEntities(),
      icon: "list",
    },
    {
      label: t`Unreferenced`,
      to: Urls.dataStudioUnreferencedEntities(),
      icon: "list",
    },
  ];

  return (
    <Stack gap="md">
      <Title order={1} py="sm" fz="sm" lh="1rem" fw="normal">{t`Tasks`}</Title>
      <PaneHeaderTabs tabs={tabs} />
    </Stack>
  );
});
