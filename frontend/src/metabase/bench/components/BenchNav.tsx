import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { usePath } from "metabase/common/hooks";
import {
  Box,
  Divider,
  Group,
  Icon,
  type IconName,
  Menu,
  NavLink,
  type NavLinkProps,
  Stack,
  Text,
} from "metabase/ui";

export function BenchNav() {
  return (
    <Box h="100%">
      <Stack
        style={{
          flexShrink: 0,
          borderRight: "1px solid var(--mb-color-border)",
        }}
        gap="sm"
        p="md"
        h="100%"
      >
        <Box data-testid="sidebar-top">
          <Box px="md" py="sm">
            <BenchNavTitleMenu />
          </Box>

          <Stack px="md" gap="sm">
            <BenchNavItem
              url="/bench/overview"
              icon="home"
              label={t`Overview`}
            />
            <BenchNavItem
              url="/bench/metadata"
              icon="database"
              label={t`Metadata`}
            />
            <Divider />
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
            <BenchNavItem
              url="/bench/segment"
              icon="filter"
              label={t`Segments`}
            />
            <Divider />
            <BenchNavItem url="/bench/model" icon="model" label={t`Models`} />
            <BenchNavItem
              url="/bench/metric"
              icon="metric"
              label={t`Metrics`}
            />
            <BenchNavItem
              url="/bench/snippet"
              icon="snippet"
              label={t`Snippets`}
            />
            <BenchNavItem
              url="/bench/glossary"
              icon="globe"
              label={t`Glossary`}
            />
            <BenchNavItem
              url="/bench/dependencies"
              icon="beaker"
              label={t`Dependencies`}
            />
          </Stack>
        </Box>
        <Stack data-testid="sidebar-bottom" px="md" gap="sm" mt="auto">
          <Divider />
          <BenchNavItem
            url="/bench/library/common.py"
            icon="code_block"
            label={t`Python Library`}
          />
        </Stack>
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
      opened={isMenuOpen}
      onClose={() => setIsMenuOpen(false)}
      position="bottom-start"
      shadow="md"
      width={200}
    >
      <Menu.Target>
        <Group
          style={{
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={handleMenuToggle}
          wrap="nowrap"
        >
          <Text
            size="lg"
            fw="bold"
            c="brand"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {/* eslint-disable-next-line */}
            {t`Metabase Workbench`}
          </Text>
          <Icon
            name="chevrondown"
            size={12}
            style={{
              transform: isMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          />
        </Group>
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

function BenchNavItem({
  url,
  icon,
  label,
  ...rest
}: { url: string; icon: IconName } & NavLinkProps) {
  const pathname = usePath();
  const isActive = pathname?.includes(url);

  return (
    <NavLink
      component={Link}
      to={url}
      active={isActive}
      leftSection={<Icon name={icon} size={16} />}
      label={label}
      py="md"
      {...rest}
    />
  );
}
