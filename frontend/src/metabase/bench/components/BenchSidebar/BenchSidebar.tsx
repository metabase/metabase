import { Box, NavLink, Stack, Text, Divider, Icon } from "metabase/ui";
import { withRouter } from "react-router";
import { t } from "ttag";
import { Link } from "react-router";

interface BenchSidebarProps {
  isDarkMode: boolean;
  location?: {
    pathname: string;
  };
}

function BenchSidebarComponent({ isDarkMode, location }: BenchSidebarProps) {
  const currentPath = location?.pathname || "";

  const isActive = (path: string) => {
    if (path === "/bench") {
      return currentPath === "/bench" || currentPath.startsWith("/bench/transform");
    }
    return currentPath.startsWith(path);
  };

  const navItems = [
    {
      label: t`Transforms`,
      icon: <Icon name="sql" size={16} />,
      path: "/bench",
      description: t`SQL transform editor and management`,
    },
    {
      label: t`Table Metadata`,
      icon: <Icon name="database" size={16} />,
      path: "/bench/metadata",
      description: t`Edit table and field metadata`,
    },
    {
      label: t`Segments`,
      icon: <Icon name="filter" size={16} />,
      path: "/bench/segments",
      description: t`Manage data segments`,
    },
    {
      label: t`Metrics`,
      icon: <Icon name="metric" size={16} />,
      path: "/bench/metrics",
      description: t`Create and manage metrics`,
    },
    {
      label: t`Models`,
      icon: <Icon name="model" size={16} />,
      path: "/bench/models",
      description: t`Create and manage models`,
    },
  ];

  return (
    <Box
      style={{
        width: "280px",
        height: "100%",
        backgroundColor: isDarkMode ? "#1A1B1E" : "#ffffff",
        borderRight: `1px solid ${isDarkMode ? "#373A40" : "#e9ecef"}`,
        padding: "16px 0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box px="md" pb="lg">
        <Text size="lg" fw="bold" c={isDarkMode ? "white" : "dark"}>
          {t`Metabase Bench`}
        </Text>
        <Text size="sm" c="dimmed" mt={4}>
          {t`Development & Data Management`}
        </Text>
      </Box>

      <Divider mb="md" />

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
            style={{
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "4px",
              backgroundColor: isActive(item.path)
                ? isDarkMode
                  ? "#373A40"
                  : "#f8f9fa"
                : "transparent",
              color: isActive(item.path)
                ? isDarkMode
                  ? "white"
                  : "dark"
                : isDarkMode
                ? "#C1C2C5"
                : "#666666",
              "&:hover": {
                backgroundColor: isDarkMode ? "#373A40" : "#f8f9fa",
                color: isDarkMode ? "white" : "dark",
              },
            }}
          />
        ))}
      </Stack>

      <Box px="md" mt="auto" pt="lg">
        <Divider mb="md" />
        <Text size="xs" c="dimmed">
          {t`Version 0.1.0`}
        </Text>
      </Box>
    </Box>
  );
}

export const BenchSidebar = withRouter(BenchSidebarComponent);
