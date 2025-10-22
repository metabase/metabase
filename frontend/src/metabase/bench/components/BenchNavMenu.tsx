import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { BenchNavItem } from "metabase/bench/components/nav/BenchNavItem";
import ExternalLink from "metabase/common/components/ExternalLink";
import LogoIcon from "metabase/common/components/LogoIcon";
import { Box, Icon, Menu, Stack, Text, UnstyledButton } from "metabase/ui";

interface BenchNavSectionProps {
  title: string;
  children: ReactNode;
}

function BenchNavSection({ title, children }: BenchNavSectionProps) {
  return (
    <Box pb="sm">
      <Text size="sm" c="text-medium" my="md" px="sm">
        {title}
      </Text>
      <Stack gap={0}>{children}</Stack>
    </Box>
  );
}

interface BenchNavMenuProps {
  onClose: () => void;
}

export function BenchNavMenu({ onClose }: BenchNavMenuProps) {
  return (
    <Box w={320} data-testid="bench-nav-menu">
      <Stack gap={0} p="lg">
        <BenchNavItem
          url="/bench/overview"
          icon="home"
          label={t`Overview`}
          onClick={onClose}
        />

        <BenchNavSection title={t`Data structuring`}>
          <BenchNavItem
            url="/bench/transforms"
            icon="sql"
            label={t`Transforms`}
            onClick={onClose}
          />
          <BenchNavItem
            url="/bench/jobs"
            icon="play_outlined"
            label={t`Jobs`}
            onClick={onClose}
          />
          <BenchNavItem url="/bench/runs" icon="list" label={t`Runs`} />
        </BenchNavSection>

        <BenchNavSection title={t`Library`}>
          <BenchNavItem
            url="/bench/metric"
            icon="metric"
            label={t`Metrics`}
            onClick={onClose}
          />
          <BenchNavItem
            url="/bench/model"
            icon="model"
            label={t`Models`}
            onClick={onClose}
          />
          <BenchNavItem
            url="/bench/segment"
            icon="filter"
            label={t`Segments`}
            onClick={onClose}
          />
          <BenchNavItem
            url="/bench/snippet"
            icon="snippet"
            label={t`SQL snippets`}
            onClick={onClose}
          />
          <BenchNavItem
            url="/bench/library/common.py"
            icon="code_block"
            label={t`Python Library`}
            onClick={onClose}
          />
        </BenchNavSection>

        <BenchNavSection title={t`Organization`}>
          <BenchNavItem
            url="/bench/metadata"
            icon="database"
            label={t`Metadata`}
            onClick={onClose}
          />
          <BenchNavItem
            url="/bench/dependencies"
            icon="beaker"
            label={t`Dependencies`}
            onClick={onClose}
          />
          <BenchNavItem
            url="/bench/glossary"
            icon="globe"
            label={t`Glossary`}
            onClick={onClose}
          />
        </BenchNavSection>
      </Stack>
    </Box>
  );
}

interface BenchNavTitleMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function BenchNavTitleMenu({
  isOpen,
  onToggle,
  onClose,
}: BenchNavTitleMenuProps) {
  return (
    <Menu
      data-testid="bench-nav-title-menu"
      opened={isOpen}
      onClose={onClose}
      position="bottom-start"
      shadow="md"
      width={200}
    >
      <Menu.Target>
        <UnstyledButton h="2.25rem" w="1.5rem" onClick={onToggle}>
          <LogoIcon size={24} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="rocket" size={16} />}
          rightSection={
            <Text size="xs" c="text-light">
              {t`⌘1`}
            </Text>
          }
          component={Link}
          to="/"
        >
          {t`Explore`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="notebook" size={16} />}
          rightSection={
            <Text size="xs" c="text-light">
              {t`⌘2`}
            </Text>
          }
          component={Link}
          to="/bench"
        >
          {t`Workbench`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="gear" size={16} />}
          rightSection={
            <Text size="xs" c="text-light">
              {t`⌘3`}
            </Text>
          }
          component={Link}
          to="/admin"
        >
          {t`Admin`}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          component={ExternalLink}
          href="https://www.metabase.com/docs"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Text size="sm">{t`Docs`}</Text>
        </Menu.Item>
        <Menu.Item component={Link} to="/admin/people">
          <Text size="sm">{t`Metabase Account`}</Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
