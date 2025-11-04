import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Button, Flex, Group, Stack, Tabs } from "metabase/ui";

import S from "./SectionLayout.module.css";

type SectionLayoutProps = {
  title?: ReactNode;
  tabs?: ReactNode;
  children?: ReactNode;
};

export function SectionLayout({ title, tabs, children }: SectionLayoutProps) {
  return (
    <Stack h="100%" gap={0}>
      <Flex
        data-testid="data-studio-header"
        className={S.header}
        px="lg"
        justify="space-between"
        align={tabs ? "start" : "center"}
        aria-label={t`Navigation bar`}
      >
        <Stack gap="sm" pt="md" py={tabs ? undefined : "md"}>
          {title}
          {tabs}
        </Stack>
        <Group my="md">
          <PLUGIN_METABOT.MetabotDataStudioButton />
          <Button component={Link} to="/">
            {t`Exit data studio`}
          </Button>
        </Group>
      </Flex>
      <Flex flex={1} mih={0}>
        <Box flex={1}>{children}</Box>
        <PLUGIN_METABOT.MetabotDataStudioSidebar />
      </Flex>
    </Stack>
  );
}

type SectionTitleProps = {
  title: string;
  description?: string;
};

export function SectionTitle({ title, description }: SectionTitleProps) {
  return (
    <Group gap="md">
      <Box fz="lg" lh="h3">
        {title}
      </Box>
      {description != null && <Box c="text-secondary">{description}</Box>}
    </Group>
  );
}

export type SectionTab = {
  label: string;
  to: string;
  isSelected: boolean;
};

type SectionTabsProps = {
  tabs: SectionTab[];
};

export function SectionTabs({ tabs }: SectionTabsProps) {
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
