import { Box, NavLink, Stack, Text, Divider, Icon } from "metabase/ui";
import { withRouter } from "react-router";
import { t } from "ttag";
import { Link } from "react-router";

interface BenchSidebarProps {
  location?: {
    pathname: string;
  };
}

function BenchSidebarComponent({ location }: BenchSidebarProps) {
  const currentPath = location?.pathname || "";

  const isActive = (path: string) => {
    if (path === "/bench") {
      return (
        currentPath === "/bench" || currentPath.startsWith("/bench/transform")
      );
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
        padding: "16px 0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box px="md" pb="lg">
        <Text size="lg" fw="bold">
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
