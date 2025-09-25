import { Box, NavLink, Stack, Text, Divider, Icon, Menu, Group } from "metabase/ui";
import { withRouter } from "react-router";
import { t } from "ttag";
import { Link } from "react-router";
import { useState } from "react";
import { useKeyboardShortcut } from "metabase/common/hooks/use-keyboard-shortcut";

interface BenchSidebarProps {
  location?: {
    pathname: string;
  };
}

function BenchSidebarComponent({ location }: BenchSidebarProps) {
  const currentPath = location?.pathname || "";
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/bench") {
      return (
        currentPath === "/bench" || currentPath.startsWith("/bench/transform")
      );
    }
    return currentPath.startsWith(path);
  };

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleExploreClick = () => {
    // Navigate to main app explore section
    window.location.href = "/";
  };

  const handleWorkbenchClick = () => {
    // Already in workbench, just close menu
    setIsMenuOpen(false);
  };

  const handleDocsClick = () => {
    // Open docs in new tab
    window.open("https://www.metabase.com/docs", "_blank");
  };

  const handleAdminClick = () => {
    // Navigate to admin section
    window.location.href = "/admin";
  };

  const handleAccountClick = () => {
    // Navigate to account settings
    window.location.href = "/admin/people";
  };

  // Keyboard shortcuts
  useKeyboardShortcut("1", (e) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      handleExploreClick();
    }
  });

  useKeyboardShortcut("2", (e) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      handleWorkbenchClick();
    }
  });

  useKeyboardShortcut("3", (e) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      handleAdminClick();
    }
  });

  const navItems = [
    {
      label: t`Transforms`,
      icon: <Icon name="sql" size={16} />,
      path: "/bench",
    },
    {
      label: t`Table Metadata`,
      icon: <Icon name="database" size={16} />,
      path: "/bench/metadata",
    },
    {
      label: t`Segments`,
      icon: <Icon name="filter" size={16} />,
      path: "/bench/segments",
    },
    {
      label: t`Metrics`,
      icon: <Icon name="metric" size={16} />,
      path: "/bench/metrics",
    },
    {
      label: t`Models`,
      icon: <Icon name="model" size={16} />,
      path: "/bench/models",
    },
  ];

  return (
    <Box
      style={{
        width: "280px",
        height: "100%",
        padding: "16px 0",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--mb-color-border)",
      }}
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
              <Text size="lg" fw="bold">
                {t`Workbench`}
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
              rightSection={<Text size="xs" c="dimmed">⌘1</Text>}
              onClick={handleExploreClick}
            >
              {t`Explore`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="notebook" size={16} />}
              rightSection={<Text size="xs" c="dimmed">⌘2</Text>}
              onClick={handleWorkbenchClick}
            >
              {t`Workbench`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="gear" size={16} />}
              rightSection={<Text size="xs" c="dimmed">⌘3</Text>}
              onClick={handleAdminClick}
            >
              {t`Admin`}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item onClick={handleDocsClick}>
              <Text size="sm">{t`Docs`}</Text>
            </Menu.Item>
            <Menu.Item onClick={handleAccountClick}>
              <Text size="sm">{t`Metabase Account`}</Text>
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Box>

      <Stack gap={4} px="md" style={{ flex: 1 }}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            component={Link}
            to={item.path}
            label={item.label}
            description={item.description}
            leftSection={item.icon}
            active={isActive(item.path)}
            px="lg"
            py="md"
          />
        ))}
      </Stack>

      <Box px="md" mt="auto" pt="lg">
        <Divider mb="md" />
        <Text size="xs">{t`Version 0.1.0`}</Text>
      </Box>
    </Box>
  );
}

export const BenchSidebar = withRouter(BenchSidebarComponent);
