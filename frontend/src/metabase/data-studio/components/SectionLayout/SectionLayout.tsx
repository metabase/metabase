import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { PLUGIN_METABOT } from "metabase/plugins";
import {
  Box,
  Button,
  Divider,
  Flex,
  Group,
  Icon,
  type IconName,
  Stack,
  Title,
} from "metabase/ui";

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
        <Stack gap="sm" py="md">
          {title}
          {tabs}
        </Stack>
        <Group py="md">
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
};

export function SectionTitle({ title }: SectionTitleProps) {
  return <Title order={4}>{title}</Title>;
}

export type SectionTab = {
  label: string;
  to: string;
  icon: IconName;
  isSelected: boolean;
};

type SectionTabsProps = {
  tabs: SectionTab[];
};

export function SectionTabs({ tabs }: SectionTabsProps) {
  return (
    <Group gap="sm">
      {tabs.map((tab, index) => {
        return (
          <Button
            key={index}
            component={Link}
            to={tab.to}
            size="sm"
            radius="xl"
            c={tab.isSelected ? "brand" : undefined}
            bg={tab.isSelected ? "brand-light" : "bg-secondary"}
            bd="none"
            leftSection={<Icon name={tab.icon} />}
          >
            {tab.label}
          </Button>
        );
      })}
    </Group>
  );
}

export function SectionTabDivider() {
  return <Divider my="sm" orientation="vertical" />;
}
