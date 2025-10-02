import type React from "react";
import { Link } from "react-router";

import { getIcon } from "metabase/browse/models/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { Box, Center, FixedSizeIcon, Flex, Loader , Text } from "metabase/ui";
import type { RecentCollectionItem } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { ItemsListSection } from "../ItemsListSection/ItemsListSection";


function MetricsList() {
  const { isLoading, data } = useFetchMetrics();
  const metrics = data?.data;

  return (
    <ItemsListSection
      sectionTitle="Metrics"
      onAddNewItem={() => {}}
      listItems={
        !metrics || isLoading
          ? <Center><Loader /></Center>
          : metrics.map((metric) => (
            <MetricListItem key={metrics.id} metric={metric} />
          ))
      }
    />
  );
}

function MetricListItem({ metric }: { metric: RecentCollectionItem }) {
  const icon = getIcon({ type: "dataset", ...metric });
  return (
    <Box mb="sm">
      <Link to={`/bench/metric/${metric.id}`}>
        <Flex gap="sm" align="center">
          <FixedSizeIcon {...icon} size={16} c="brand" />
          <Text fw="bold">
            {metric.name}
          </Text>
        </Flex>
        <Flex gap="sm" c="text-light" ml="lg">
          <FixedSizeIcon name="folder" />
          <EllipsifiedCollectionPath collection={metric.collection} />
        </Flex>
      </Link>
    </Box>
  );
}

export const MetricsLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <BenchLayout
      nav={<MetricsList />}
      name="model"
    >
      {children}
    </BenchLayout>
  )
};

export const MetricEditor = (props: { location: unknown, params: unknown }) => {
  return (
    <QueryBuilder {...props} />
  );
};
