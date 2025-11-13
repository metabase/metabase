import { useMemo } from "react";

import {
  useGetCollectionQuery,
  useListCollectionItemsQuery,
} from "metabase/api/collection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Center, Flex } from "metabase/ui";

import { PaneHeader, PanelHeaderTitle } from "../../../components/PaneHeader";

import { ModelingCollectionEmptyState } from "./ModelingCollectionEmptyState";
import S from "./ModelingCollectionView.module.css";
import { type ModelingItem, ModelingItemsTable } from "./ModelingItemsTable";

type ModelingCollectionViewParams = {
  collectionId: string;
};

type ModelingCollectionViewProps = {
  params: ModelingCollectionViewParams;
};

export function ModelingCollectionView({
  params,
}: ModelingCollectionViewProps) {
  const {
    data: collection,
    isLoading: isLoadingCollection,
    error: collectionError,
  } = useGetCollectionQuery({
    id: params.collectionId,
  });
  const {
    data,
    isLoading: isLoadingItems,
    error: itemsError,
  } = useListCollectionItemsQuery({
    id: params.collectionId,
    models: ["dataset", "metric"],
  });
  const isLoading = isLoadingCollection || isLoadingItems;
  const error = collectionError ?? itemsError;

  const items = useMemo(() => {
    if (!data?.data) {
      return [];
    }
    return data.data.filter(
      (item): item is ModelingItem =>
        item.model === "dataset" || item.model === "metric",
    );
  }, [data]);

  if (isLoading || error != null || collection == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const showEmptyState = items.length === 0;

  return (
    <Flex direction="column" h="100%">
      <PaneHeader
        title={<PanelHeaderTitle>{collection.name}</PanelHeaderTitle>}
      />
      <Box className={S.body} flex={1} p="lg" mih={0} bg="bg-light">
        {showEmptyState ? (
          <ModelingCollectionEmptyState collection={collection} />
        ) : (
          <ModelingItemsTable items={items} />
        )}
      </Box>
    </Flex>
  );
}
