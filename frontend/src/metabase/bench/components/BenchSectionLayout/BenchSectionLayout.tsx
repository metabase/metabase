import type { ReactNode } from "react";
import { Link } from "react-router";

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
      <Stack
        className={S.header}
        px="lg"
        pt="md"
        py={tabs ? undefined : "md"}
        gap="sm"
      >
        {title}
        {tabs}
      </Stack>
      <Box flex={1}>{children}</Box>
    </Stack>
  );
}

type BenchSectionTitleProps = {
  title: string;
  description?: string;
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
      {description != null && <Box c="text-secondary">{description}</Box>}
    </Group>
  );
}

export type BenchSectionTab = {
  label: string;
  to: string;
  isSelected: boolean;
};

type BenchSectionTabsProps = {
  tabs: BenchSectionTab[];
};

export function BenchSectionTabs({ tabs }: BenchSectionTabsProps) {
  const selectedTab = tabs.find((tab) => tab.isSelected);

  return (
    <Tabs value={selectedTab ? selectedTab.to : null}>
      <Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.to}
            component={Link}
            value={tab.to}
            {...{ to: tab.to }}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
