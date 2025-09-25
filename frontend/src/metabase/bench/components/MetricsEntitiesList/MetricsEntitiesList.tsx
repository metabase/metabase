import { ActionIcon, Button, Group, Stack, Text } from "metabase/ui";
import { Icon } from "metabase/ui";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import type { Card } from "metabase-types/api";
import Link from "metabase/common/components/Link";

interface MetricsEntitiesListProps {
  selectedMetricId?: number;
  onMetricClick?: (metric: Card) => void;
}

export function MetricsEntitiesList({
  selectedMetricId,
  onMetricClick,
}: MetricsEntitiesListProps) {
  const { data: searchResponse, isLoading, error } = useFetchMetrics();

  if (isLoading) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const metrics = searchResponse?.data || [];

  return (
    <Stack spacing="md">
      <Link to="bench/metrics/new">
        <Button variant="light" leftIcon={<Icon name="add" />} fullWidth>
          New Metric
        </Button>
      </Link>

      {metrics.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          No metrics found
        </Text>
      ) : (
        metrics.map((metric) => (
          <Group
            key={metric.id}
            p="xs"
            style={{
              borderRadius: "4px",
              cursor: "pointer",
              backgroundColor:
                selectedMetricId === metric.id
                  ? "var(--mantine-color-blue-1)"
                  : "transparent",
              ":hover": {
                backgroundColor:
                  selectedMetricId === metric.id
                    ? "var(--mantine-color-blue-2)"
                    : "var(--mantine-color-gray-1)",
              },
            }}
          >
            <Link to={`/bench/metrics/${metric.id}`}>
              <ActionIcon variant="subtle" size="sm">
                <Icon name="metric" />
              </ActionIcon>
              <Text size="sm" style={{ flex: 1 }} truncate>
                {metric.name}
              </Text>
              <Text size="xs" c="dimmed">
                {metric.collection?.name || "No collection"}
              </Text>
            </Link>
          </Group>
        ))
      )}
    </Stack>
  );
}
