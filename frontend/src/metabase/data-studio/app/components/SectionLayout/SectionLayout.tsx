import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Button, Flex, Group, Stack, Title } from "metabase/ui";

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
        py="md"
        justify="space-between"
        align={tabs ? "start" : "center"}
        aria-label={t`Navigation bar`}
      >
        <Stack gap="sm">
          {title}
          {tabs}
        </Stack>
        <Group>
          <PLUGIN_METABOT.MetabotDataStudioButton />
          <Button component={Link} to="/">
            {t`Exit data studio`}
          </Button>
        </Group>
      </Flex>
      <Flex flex={1} mih={0} miw={0}>
        <Box flex={1} miw={0}>
          {children}
        </Box>
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
