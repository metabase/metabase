import type React from "react";
import { Link } from "react-router";

import { getIcon } from "metabase/browse/models/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { Box, Center, FixedSizeIcon, Flex, Loader , Text } from "metabase/ui";
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

export const ModelEditor = (props: {location: unknown, params: unknown }) => {
  return (
    <QueryBuilder {...props} />
  )
};
