import type React from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { skipToken, useGetCardQuery, useGetDatabaseQuery, useListDatabasesQuery } from "metabase/api";
import { getIcon } from "metabase/browse/models/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import { View } from "metabase/query_builder/components/view/View";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { Box, Center, FixedSizeIcon, Flex, Icon, Loader , Text } from "metabase/ui";
import type { RecentCollectionItem } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { ItemsListSection } from "../ItemsListSection/ItemsListSection";


function ModelsList() {
  const { isLoading, data } = useFetchModels();
  const models = data?.data;

  return (
    <ItemsListSection
      sectionTitle="Models"
      onAddNewItem={() => {}}
      listItems={
        !models || isLoading
          ? <Center><Loader /></Center>
          : models.map((model) => (
            <ModelListItem key={model.id} model={model} />
          ))
      }
    />
  );
}

function ModelListItem({ model }: { model: RecentCollectionItem }) {
  const icon = getIcon({ type: "dataset", ...model });
  return (
    <Box mb="sm">
      <Link to={`/bench/model/${model.id}`}>
        <Flex gap="sm" align="center">
          <FixedSizeIcon {...icon} size={16} c="brand" />
          <Text fw="bold">
            {model.name}
          </Text>
        </Flex>
        <Flex gap="sm" c="text-light" ml="lg">
          <FixedSizeIcon name="folder" />
          <EllipsifiedCollectionPath collection={model.collection} />
        </Flex>
      </Link>
    </Box>
  );
}

export const ModelsLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <BenchLayout
      nav={<ModelsList />}
      name="model"
    >
      {children}
    </BenchLayout>
  )
};

export const ModelMetadataEditor = (props) => {
  const { data: model, isLoading } = useGetCardQuery(props.params.id ? { id: props.params.id }: skipToken);

  if (!model || isLoading) {
    return <LoadingAndErrorWrapper loading={isLoading} />;
  }

  return (
    <Box p="lg">
      <Flex mb="md" align="center" fw="bold">
        <Icon name="model" c="brand" mr="sm" size={24} />
        <Text size="lg">
          {model.name}
        </Text>
      </Flex>
      <Box p="lg">
        {model.result_metadata?.map((col, index) => (
          <Box key={index} mb="md">
            <Text fw="bold">{col.name} / {col.display_name}</Text>
            <Text c="text-light">{col.base_type}</Text>
            <Text c="text-light">{col.semantic_type}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
};
