import { t } from "ttag";

import { type OverviewEntityType, useGetMetricQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { MetricCubeViewer } from "metabase/metric-cube-viewer";
import { MetricDimensionGrid } from "metabase/metrics/components/MetricDimensionGrid";
import { Box, Center } from "metabase/ui";

type OverviewContentProps = {
  entityType: OverviewEntityType;
  entityId: number | undefined;
  generatorId: string;
};

function MetricArm({ metricId }: { metricId: number }) {
  const { data: metric, isLoading, error } = useGetMetricQuery(metricId);
  if (isLoading || error) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }
  const dimensions = metric?.dimensions ?? [];
  if (dimensions.length === 0) {
    return (
      <Center h="100%">
        <EmptyState icon="metric" title={t`This metric has no dimensions.`} />
      </Center>
    );
  }
  return (
    <Box px="3rem" py="xl">
      <MetricDimensionGrid
        metricId={metricId}
        dimensions={dimensions}
        showAllDimensions
      />
    </Box>
  );
}

/** The shipped overview surface for the entity, driven by the chosen generator. */
export function OverviewContent({
  entityType,
  entityId,
  generatorId,
}: OverviewContentProps) {
  if (entityId == null) {
    return (
      <Center h="100%">
        <EmptyState icon="search" title={t`Pick something to review`} />
      </Center>
    );
  }
  switch (entityType) {
    case "table":
      return (
        <MetricCubeViewer
          tableId={entityId}
          generatorId={generatorId}
          chrome="none"
          columns={1}
        />
      );
    case "metric":
      return <MetricArm metricId={entityId} />;
    case "transform":
      return (
        <Center h="100%">
          <EmptyState icon="sql" title={t`Transform arm comes in round 2`} />
        </Center>
      );
  }
}
