import { t } from "ttag";

import {
  CompactPinnedItemCard,
  CompactPinnedItemCardSkeleton,
} from "metabase/common/collections/components/CompactPinnedItemCard";
import { Box, Repeat, SimpleGrid, Text } from "metabase/ui";
import type { RecentCollectionItem } from "metabase-types/api";

import { trackModelClick } from "./analytics";

export function RecentModels({
  models = [],
  skeleton,
}: {
  models?: RecentCollectionItem[];
  skeleton?: boolean;
}) {
  if (!skeleton && models.length === 0) {
    return null;
  }
  const headingId = "recently-viewed-models-heading";
  return (
    <Box
      w="auto"
      my="lg"
      role="grid"
      aria-labelledby={skeleton ? undefined : headingId}
      mah={skeleton ? "11rem" : undefined}
      style={skeleton ? { overflow: "hidden" } : undefined}
    >
      <Text
        id={skeleton ? undefined : headingId}
        fw="bold"
        fz={16}
        color="text-primary"
        mb="lg"
        style={{ visibility: skeleton ? "hidden" : undefined }}
      >{t`Recents`}</Text>
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} mb="sm" spacing="md">
        {skeleton ? (
          <Repeat times={2}>
            <CompactPinnedItemCardSkeleton icon="model" />
          </Repeat>
        ) : (
          models.map((model) => (
            <CompactPinnedItemCard
              key={`model-${model.id}`}
              item={model}
              onClick={() => trackModelClick(model.id)}
            />
          ))
        )}
      </SimpleGrid>
    </Box>
  );
}
