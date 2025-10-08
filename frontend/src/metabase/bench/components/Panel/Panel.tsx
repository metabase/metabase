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

interface CreateNewOption {
  label: string;
  path: string;
}

interface CreateNewSegmented {
  defaultPath: string;
  options: CreateNewOption[];
}

interface BenchPanelProps {
  title: string;
  children: ReactNode;
  height?: string | number;
  createNewPath?: string;
  createNewSegmented?: CreateNewSegmented;
}

export function BenchPanel({
  title,
  children,
  height = "100%",
  createNewPath,
  createNewSegmented,
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

              {createNewSegmented ? (
                <Group gap={0}>
                  <Button
                    component={Link}
                    to={createNewSegmented.defaultPath}
                    variant="light"
                    size="xs"
                    style={{
                      borderTopRightRadius: 0,
                      borderBottomRightRadius: 0,
                      borderRight: "1px solid var(--mb-color-border)",
                      paddingLeft: "8px",
                      paddingRight: "8px",
                    }}
                  >
                    <Icon name="add" size={12} />
                  </Button>
                  <Menu position="bottom-end" shadow="md">
                    <Menu.Target>
                      <Button
                        variant="light"
                        size="xs"
                        style={{
                          borderTopLeftRadius: 0,
                          borderBottomLeftRadius: 0,
                          paddingLeft: "8px",
                          paddingRight: "8px",
                        }}
                      >
                        <Icon name="chevrondown" size={12} />
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {createNewSegmented.options.map((option) => (
                        <Menu.Item
                          key={option.path}
                          component={Link}
                          to={option.path}
                        >
                          {option.label}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              ) : createNewPath ? (
                <Button
                  component={Link}
                  to={createNewPath}
                  variant="light"
                  size="xs"
                  style={{
                    paddingLeft: "6px",
                    paddingRight: "6px",
                  }}
                >
                  <Icon name="add" size={12} />
                </Button>
              ) : null}
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
