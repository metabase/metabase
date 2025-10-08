import cx from "classnames";
import type { Location } from "history";
import type React from "react";
import { Link } from "react-router";

import { getIcon } from "metabase/browse/models/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import * as Urls from "metabase/lib/urls";
import {
  Button,
  Center,
  FixedSizeIcon,
  Flex,
  Group,
  Icon,
  Loader,
  Text,
} from "metabase/ui";
import type { RecentCollectionItem } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { ItemsListSection } from "../ItemsListSection/ItemsListSection";
import { MetricEditor } from "../metrics/MetricsList";

import { ModelListItem } from "./ModelListItem";

function ModelsList({ params }: { params: { modelId: string } }) {
  const { isLoading, data } = useFetchModels();
  const models = data?.data;

  const selectedModelId = params.modelId
    ? Urls.extractEntityId(params.modelId)
    : null;

  return (
    <ItemsListSection
      sectionTitle="Models"
      onAddNewItem={() => {}}
      listItems={
        !models || isLoading ? (
          <Center>
            <Loader />
          </Center>
        ) : (
          models.map((model) => (
            <ModelListItem
              key={model.id}
              model={model}
              isSelected={model.id === selectedModelId}
            />
          ))
        )
      }
    />
  );
}

export const ModelsLayout = ({
  params,
  children,
}: {
  params: { slug: string };
  children: React.ReactNode;
}) => {
  return (
    <BenchLayout nav={<ModelsList params={params} />} name="model">
      {children}
    </BenchLayout>
  );
};

export const ModelEditor = (props: {
  location: Location;
  params: { slug: string };
}) => {
  // TODO: Make MetricEditor less metric-specific
  return <MetricEditor {...props} />;
};
