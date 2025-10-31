import type { Location } from "history";
import type { ReactNode } from "react";

import { Box, Group, Stack, Tabs } from "metabase/ui";

import S from "./BenchSectionLayout.module.css";

type BenchSectionLayoutProps = {
  title?: ReactNode;
  tabs?: ReactNode;
  children?: ReactNode;
};

export function BenchSectionLayout({
  title,
  tabs,
  children,
}: BenchSectionLayoutProps) {
  return (
    <Stack h="100%" gap={0}>
      <Stack className={S.header} px="lg" py="md">
        {title}
        {tabs}
      </Stack>
      <Box flex={1}>{children}</Box>
    </Stack>
  );
}

type BenchSectionTitleProps = {
  title: string;
  description: string;
};

export function BenchSectionTitle({
  title,
  description,
}: BenchSectionTitleProps) {
  return (
    <Group gap="md">
      <Box fz="lg" lh="h3">
        {title}
      </Box>
      <Box c="text-secondary">{description}</Box>
    </Group>
  );
}

export type BenchSectionTab = {
  label: string;
  to: string;
};

type BenchSectionTabsProps = {
  tabs: BenchSectionTab[];
  location: Location;
};

export function BenchSectionTabs({ tabs, location }: BenchSectionTabsProps) {
  const selectedTab = tabs.find((tab) => location.pathname.startsWith(tab.to));

  return (
    <Tabs value={selectedTab?.to}>
      <Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.to} value={tab.to}>
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
