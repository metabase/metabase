import {
  Stack,
  Title,
  Box,
  Button,
  Group,
  Menu,
  Icon,
  Flex,
} from "metabase/ui";
import { Link } from "react-router";
import { t } from "ttag";
import type { ReactNode } from "react";

interface BenchPanelProps {
  title: string;
  children: ReactNode;
  height?: string | number;
  createNewPath?: string;
}

export function BenchPanel({
  title,
  children,
  height = "100%",
  createNewPath,
}: BenchPanelProps) {
  return (
    <Box
      style={{
        width: "100%",
        height,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mb-color-bg-secondary)",
        borderRight: "1px solid var(--mb-color-border)",
      }}
    >
      <Box
        p="md"
        style={{
          borderBottom: "1px solid var(--mb-color-border)",
          backgroundColor: "var(--mb-color-bg-secondary)",
        }}
      >
        <Flex>
          <Group gap="xs" justify="space-between" style={{ width: "100%" }}>
            <Menu position="bottom-start" shadow="md">
              <Menu.Target>
                <Button
                  variant="subtle"
                  size="xs"
                  rightSection={<Icon name="chevrondown" size={12} />}
                >
                  {t`All ${title}`}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item disabled>{t`Filters coming soon`}</Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Group gap="xs">
              <Menu position="bottom-start" shadow="md">
                <Menu.Target>
                  <Button
                    variant="subtle"
                    size="xs"
                    rightSection={<Icon name="chevrondown" size={12} />}
                  >
                    <Icon name="sort" size={12} />
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item>{t`Alphabetical`}</Menu.Item>
                  <Menu.Item>{t`Most recent`}</Menu.Item>
                  <Menu.Item>{t`Least recent`}</Menu.Item>
                </Menu.Dropdown>
              </Menu>

              {createNewPath && (
                <Button
                  component={Link}
                  to={createNewPath}
                  variant="light"
                  size="xs"
                >
                  <Icon name="add" size={12} />
                </Button>
              )}
            </Group>
          </Group>
        </Flex>
      </Box>
      <Box p="md" style={{ flex: 1, overflow: "auto" }}>
        <Stack gap="sm">{children}</Stack>
      </Box>
    </Box>
  );
}
