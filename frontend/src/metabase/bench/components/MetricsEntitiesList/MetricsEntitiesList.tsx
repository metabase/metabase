import { Button, NavLink, Stack, Text } from "metabase/ui";
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
        <Text size="sm" ta="center" py="md">
          No metrics found
        </Text>
      ) : (
        metrics.map((metric) => (
          <NavLink
            key={metric.id}
            component={Link}
            to={`/bench/metrics/${metric.id}`}
            label={metric.name}
            description={metric.collection?.name || "No collection"}
            leftSection={<Icon name="metric" size={16} />}
            active={selectedMetricId === metric.id}
            onClick={() => onMetricClick?.(metric)}
          />
        ))
      )}
    </Stack>
  );
}
