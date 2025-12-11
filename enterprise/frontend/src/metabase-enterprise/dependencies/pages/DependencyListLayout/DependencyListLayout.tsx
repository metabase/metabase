import type { ReactNode } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Stack, Title } from "metabase/ui";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";

type DependencyListLayoutProps = {
  children: ReactNode;
};

export function DependencyListLayout({ children }: DependencyListLayoutProps) {
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
    <Stack h="100%" px="3.5rem" py="md" gap="md" bg="accent-gray-light">
      <Title order={1} fz="sm" lh="1rem" fw="normal">{t`Tasks`}</Title>
      <PaneHeaderTabs tabs={tabs} />
      {children}
    </Stack>
  );
}
