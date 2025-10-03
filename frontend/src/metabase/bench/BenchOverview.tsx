import { Box, Text, Card, Group, Button, Icon, Stack } from "metabase/ui";
import { Link } from "react-router";
import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import _ from "underscore";

export function BenchOverview() {
  const user = useSelector(getUser);
const greeting = "Hello"

  const toolCards = [
    {
      title: t`Transforms`,
      description: t`Create and manage data transformation pipelines`,
      icon: <Icon name="sql" size={24} />,
      path: "/bench/transforms",
      color: "blue",
    },
    {
      title: t`Table Metadata`,
      description: t`Explore and manage database schemas and table structures`,
      icon: <Icon name="database" size={24} />,
      path: "/bench/metadata",
      color: "green",
    },
    {
      title: t`Segments`,
      description: t`Define and manage user segments for targeted analysis`,
      icon: <Icon name="filter" size={24} />,
      path: "/bench/segments",
      color: "purple",
    },
    {
      title: t`Metrics`,
      description: t`Create and manage business metrics and KPIs`,
      icon: <Icon name="metric" size={24} />,
      path: "/bench/metrics",
      color: "orange",
    },
    {
      title: t`Models`,
      description: t`Build and manage data models for consistent analysis`,
      icon: <Icon name="model" size={24} />,
      path: "/bench/models",
      color: "teal",
    },
  ];

  return (
    <Box
      style={{
        height: "100vh",
        overflow: "auto",
        padding: "32px",
        backgroundColor: "var(--mb-color-bg-light)",
      }}
    >
      <Stack gap="xl">
        {/* Welcome Section */}
        <Box>
          <Text size="xl" fw="bold" mb="sm">
            {greeting}
          </Text>
        </Box>

        {/* Tool Cards Grid */}
        <Box>
          <Text size="lg" fw="bold" mb="md">
            {t`Available Tools`}
          </Text>
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "20px",
            }}
          >
            {toolCards.map((tool) => (
              <Card
                key={tool.path}
                component={Link}
                to={tool.path}
                p="xl"
              >
                <Group mb="md">
                  <Box
                    style={{
                      color: `var(--mb-color-${tool.color}-6)`,
                    }}
                  >
                    {tool.icon}
                  </Box>
                  <Text size="lg" fw="bold">
                    {tool.title}
                  </Text>
                </Group>
                <Text size="sm">
                  {tool.description}
                </Text>
              </Card>
            ))}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
