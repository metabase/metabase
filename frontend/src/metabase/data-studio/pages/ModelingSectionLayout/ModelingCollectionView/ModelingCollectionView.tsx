import { useMemo } from "react";
import { t } from "ttag";

import {
  useGetCollectionQuery,
  useListCollectionItemsQuery,
} from "metabase/api/collection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Center, Group, Stack, Text } from "metabase/ui";

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
    <Box h="100%" className={S.root}>
      <Box className={S.content}>
        <Stack gap="md">
          <Group align="center" wrap="nowrap" justify="space-between">
            <Text fw="bold" fz="1.5rem">
              {collection?.name || t`Collection`}
            </Text>
          </Group>
          {showEmptyState ? (
            <Box className={S.emptyState}>
              <ModelingCollectionEmptyState collection={collection} />
            </Box>
          ) : (
            <ModelingItemsTable items={items} skeleton={isLoading} />
          )}
        </Stack>
      </Box>
    </Box>
  );
}
