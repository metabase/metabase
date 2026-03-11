import { MetricDimensionGrid } from "metabase/metrics/components/MetricDimensionGrid";
import type { Card } from "metabase-types/api";

type MetricHomeOverviewProps = {
  card: Card;
};

export function MetricHomeOverview({ card }: MetricHomeOverviewProps) {
  if (card.id == null) {
    return null;
  }

  return <MetricDimensionGrid metricId={card.id} />;
}
