import type React from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { skipToken, useGetCardQuery, useGetDatabaseQuery, useListDatabasesQuery } from "metabase/api";
import { getIcon } from "metabase/browse/models/utils";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import { View } from "metabase/query_builder/components/view/View";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { Box, Center, FixedSizeIcon, Flex, Icon, Loader , Text } from "metabase/ui";
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

export const MetricEditor = (props) => {
  const { data: metric, isLoading } = useGetCardQuery(props.params.id ? { id: props.params.id }: skipToken);

  if (!metric || isLoading) {
    return <LoadingAndErrorWrapper loading={isLoading} />;
  }

  return (
    <Box p="lg">
      <Flex mb="md" align="center" fw="bold">
        <Icon name="metric" c="brand" mr="sm" size={24} />
        <Text size="lg">
          {metric.name}
        </Text>
      </Flex>
      <Box>
        <CodeMirror
          value={JSON.stringify(metric?.dataset_query.query, null, 2) || ""}
          height="100%"
        />
      </Box>
    </Box>
  )
};
