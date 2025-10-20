import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { BenchNavCollapseSection } from "metabase/bench/components/nav/BenchNavCollapseSection";
import { BenchNavItem } from "metabase/bench/components/nav/BenchNavItem";
import ExternalLink from "metabase/common/components/ExternalLink";
import LogoIcon from "metabase/common/components/LogoIcon";
import { Box, Icon, Menu, Stack, Text, UnstyledButton } from "metabase/ui";

export function BenchNav() {
  return (
    <Box h="100%" data-testid="bench-nav">
      <Stack
        style={{
          flexShrink: 0,
          borderRight: "1px solid var(--mb-color-border)",
        }}
        gap="sm"
        h="100%"
      >
        <Box data-testid="sidebar-top">
          <Box px="xl" py="md">
            <BenchNavTitleMenu />
          </Box>

          <Stack px="md" gap={0}>
            <BenchNavItem
              url="/bench/overview"
              icon="home"
              label={t`Overview`}
            />

            <BenchNavCollapseSection
              title={t`Data structuring`}
              slug="data-structuring"
            >
              <BenchNavItem
                url="/bench/transforms"
                icon="sql"
                label={t`Transforms`}
              />
              <Box pl="md">
                <BenchNavItem
                  url="/bench/jobs"
                  icon="play_outlined"
                  label={t`Jobs`}
                />
                <BenchNavItem url="/bench/runs" icon="list" label={t`Runs`} />
              </Box>
            </BenchNavCollapseSection>

            <BenchNavCollapseSection title={t`Library`} slug="library">
              <BenchNavItem
                url="/bench/metric"
                icon="metric"
                label={t`Metrics`}
              />
              <BenchNavItem url="/bench/model" icon="model" label={t`Models`} />
              <Box pl="md">
                <BenchNavItem
                  url="/bench/segment"
                  icon="filter"
                  label={t`Segments`}
                />
              </Box>
              <BenchNavItem
                url="/bench/snippet"
                icon="snippet"
                label={t`SQL snippets`}
              />
              <BenchNavItem
                url="/bench/library/common.py"
                icon="code_block"
                label={t`Python Library`}
              />
            </BenchNavCollapseSection>

            <BenchNavCollapseSection
              title={t`Organization`}
              slug="organization"
            >
              <BenchNavItem
                url="/bench/metadata"
                icon="database"
                label={t`Metadata`}
              />
              <BenchNavItem
                url="/bench/dependencies"
                icon="beaker"
                label={t`Dependencies`}
              />
              <BenchNavItem
                url="/bench/glossary"
                icon="globe"
                label={t`Glossary`}
              />
            </BenchNavCollapseSection>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

function BenchNavTitleMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  return (
    <Menu
      data-testid="bench-nav-title-menu"
      opened={isMenuOpen}
      onClose={() => setIsMenuOpen(false)}
      position="bottom-start"
      shadow="md"
      width={200}
    >
      <Menu.Target>
        <UnstyledButton h="2.25rem" w="1.5rem" onClick={handleMenuToggle}>
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
          // eslint-disable-next-line
          href="https://www.metabase.com/docs"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Text size="sm">{t`Docs`}</Text>
        </Menu.Item>
        <Menu.Item component={Link} to="/admin/people">
          {/* eslint-disable-next-line */}
          <Text size="sm">{t`Metabase Account`}</Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
