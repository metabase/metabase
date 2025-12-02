import { useMemo } from "react";

import {
  useGetCollectionQuery,
  useListCollectionItemsQuery,
} from "metabase/api/collection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Center, Flex } from "metabase/ui";

import {
  PaneHeader,
  PanelHeaderTitle,
} from "../../../common/components/PaneHeader";

import { CollectionEmptyState } from "./CollectionEmptyState";
import {
  CollectionItemsTable,
  type ModelingItem,
} from "./CollectionItemsTable";
import S from "./CollectionPage.module.css";

type CollectionPageParams = {
  collectionId: string;
};

type CollectionPageProps = {
  params: CollectionPageParams;
};

export function CollectionPage({ params }: CollectionPageProps) {
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
    include_editable_data_model: true,
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
    <Flex direction="column" h="100%" data-testid="collection-page">
      <PaneHeader
        title={<PanelHeaderTitle>{collection.name}</PanelHeaderTitle>}
      />
      <Box className={S.body} flex={1} p="lg" mih={0} bg="bg-light">
        {showEmptyState ? (
          <CollectionEmptyState collection={collection} />
        ) : (
          <CollectionItemsTable items={items} />
        )}
      </Box>
    </Flex>
  );
}
