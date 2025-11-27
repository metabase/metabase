import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import * as Urls from "metabase/lib/urls";
import { Box, Group, Stack } from "metabase/ui";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type TasksSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function TasksSectionLayout({
  location,
  children,
}: TasksSectionLayoutProps) {
  usePageTitle(t`Tasks`);

  return (
    <SectionLayout title={<SectionTitle title={t`Tasks`} />}>
      <Stack h="100%" gap={0}>
        <Box px="lg" py="md" bg="bg-light">
          <TasksSectionTabs location={location} />
        </Box>
        <Box flex={1} mih={0}>
          {children}
        </Box>
      </Stack>
    </SectionLayout>
  );
}

type TasksSectionTabsProps = {
  location: Location;
};

function TasksSectionTabs({ location }: TasksSectionTabsProps) {
  return (
    <Group>
      <PaneHeaderTabs tabs={getTabs(location)} withBackground />
    </Group>
  );
}

function getTabs({ pathname }: Location): PaneHeaderTab[] {
  const isBroken = pathname.startsWith(Urls.dataStudioTasksBroken());
  const isUnreferenced = pathname.startsWith(
    Urls.dataStudioTasksUnreferenced(),
  );

  return [
    {
      label: t`Broken`,
      to: Urls.dataStudioTasksBroken(),
      isSelected: isBroken,
    },
    {
      label: t`Unreferenced`,
      to: Urls.dataStudioTasksUnreferenced(),
      isSelected: isUnreferenced,
    },
  ];
}
