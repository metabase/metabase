import { t } from "ttag";

import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import { Box, Text } from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import type { RecentCollectionItem } from "metabase-types/api";

import { trackModelClick } from "../analytics";

import { RecentModelsGrid } from "./RecentModels.styled";

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
      aria-labelledby={headingId}
      mah={skeleton ? "10.25rem" : undefined}
      style={skeleton ? { overflow: "hidden" } : undefined}
    >
      <Text
        id={headingId}
        fw="bold"
        size={16}
        color="text-dark"
        mb="lg"
        style={{ visibility: skeleton ? "hidden" : undefined }}
      >{t`Recents`}</Text>
      <RecentModelsGrid>
        {skeleton ? (
          <Repeat times={2}>
            <PinnedItemCard skeleton iconForSkeleton="model" />
          </Repeat>
        ) : (
          models.map(model => (
            <PinnedItemCard
              key={`model-${model.id}`}
              item={model}
              onClick={() => trackModelClick(model.id)}
            />
          ))
        )}
      </RecentModelsGrid>
    </Box>
  );
}
