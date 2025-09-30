import { useState } from "react";
import { Link, withRouter } from "react-router";
import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import {
  Box,
  Divider,
  Group,
  Icon,
  Menu,
  NavLink,
  Stack,
  Text,
} from "metabase/ui";

interface BenchSidebarProps {
  location?: {
    pathname: string;
  };
}

function _BenchNav({ location }: BenchSidebarProps) {
  const currentPath = location?.pathname || "";
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/bench/overview") {
      return currentPath === "/bench" || currentPath === "/bench/overview";
    }
    if (path === "/bench/transforms") {
      return currentPath.startsWith("/bench/transform");
    }
    return currentPath.startsWith(path);
  };

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <Stack
      h="100%"
      w="17rem"
      bd="1px solid var(--mb-color-border)"
      style={{ flexShrink: 0 }}
    >
      <Box p="lg">
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
            >
              <Text size="lg" fw="bold" c="brand">
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
      </Box>

      <Stack gap={4} px="md" style={{ flex: 1 }}>
        <Box>
          <NavLink
            component={Link}
            to="/bench/overview"
            label={t`Overview`}
            leftSection={<Icon name="home" size={16} />}
            active={isActive("/bench/overview")}
            px="lg"
            py="md"
          />
        </Box>
        <Divider />

        <Box>
          <NavLink
            component={Link}
            to="/bench/metadata"
            label={t`Metadata`}
            leftSection={<Icon name="database" size={16} />}
            active={isActive("/bench/metadata")}
            px="lg"
            py="md"
          />
        </Box>
        <Divider />

        <Box>
          <NavLink
            component={Link}
            to="/bench/transforms"
            label={t`Transforms`}
            leftSection={<Icon name="sql" size={16} />}
            active={isActive("/bench/transforms")}
            px="lg"
            py="md"
          />
        </Box>

        <Box>
          <NavLink
            component={Link}
            to="/bench/segments"
            label={t`Segments`}
            leftSection={<Icon name="filter" size={16} />}
            active={isActive("/bench/segments")}
            px="lg"
            py="md"
          />
        </Box>

        <Box>
          <NavLink
            component={Link}
            to="/bench/model"
            label={t`Models`}
            leftSection={<Icon name="model" size={16} />}
            active={isActive("/bench/model")}
            px="lg"
            py="md"
          />
        </Box>
        <Divider />

        <Box>
          <NavLink
            component={Link}
            to="/bench/metrics"
            label={t`Metrics`}
            leftSection={<Icon name="metric" size={16} />}
            active={isActive("/bench/metrics")}
            px="lg"
            py="md"
          />
        </Box>
      </Stack>

      <Box px="md" mt="auto" pt="lg">
        <Divider mb="md" />
        <Text size="xs">{t`Version 0.1.0`}</Text>
      </Box>
    </Stack>
  );
}

export const BenchNav = withRouter(_BenchNav);
