import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button, Group, Stack, Tabs } from "metabase/ui";

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
      <Group
        className={S.header}
        px="lg"
        justify="space-between"
        align={tabs ? "start" : "center"}
      >
        <Stack gap="sm" pt="md" py={tabs ? undefined : "md"}>
          {title}
          {tabs}
        </Stack>
        <Button my="md" component={Link} to="/">
          {t`Exit workbench`}
        </Button>
      </Group>
      <Box flex={1} mih={0}>
        {children}
      </Box>
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
      <Tabs.List style={{ "--tab-border-color": "transparent" }}>
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
