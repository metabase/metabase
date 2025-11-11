import { useMemo } from "react";
import { t } from "ttag";

import {
  useGetCollectionQuery,
  useListCollectionItemsQuery,
} from "metabase/api/collection";
import { Box, Group, Stack, Text } from "metabase/ui";

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
  const { data: collection } = useGetCollectionQuery({
    id: params.collectionId,
  });

  const { data, isLoading } = useListCollectionItemsQuery({
    id: params.collectionId,
    models: ["dataset", "metric"],
  });

  const items = useMemo(() => {
    if (!data?.data) {
      return [];
    }
    return data.data.filter(
      (item): item is ModelingItem =>
        item.model === "dataset" || item.model === "metric",
    );
  }, [data]);

  const showEmptyState = !isLoading && items.length === 0;

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
              <ModelingCollectionEmptyState />
            </Box>
          ) : (
            <ModelingItemsTable items={items} skeleton={isLoading} />
          )}
        </Stack>
      </Box>
    </Box>
  );
}
