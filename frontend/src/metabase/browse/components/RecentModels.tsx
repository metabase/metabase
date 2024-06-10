import { t } from "ttag";

import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import { Box, Text } from "metabase/ui";
import type { RecentCollectionItem } from "metabase-types/api";

import { trackModelClick } from "../analytics";

import { RecentModelsGrid } from "./RecentModels.styled";

export function RecentModels({ models }: { models: RecentCollectionItem[] }) {
  if (models.length === 0) {
    return null;
  }

  const headingId = "recently-viewed-models-heading";
  return (
    <Box my="lg" role="grid" aria-labelledby={headingId}>
      <Text
        id={headingId}
        fw="bold"
        size={16}
        color="text-dark"
        mb="lg"
      >{t`Recents`}</Text>
      <RecentModelsGrid>
        {models.map(model => (
          <PinnedItemCard
            key={`model-${model.id}`}
            item={model}
            onClick={() => trackModelClick(model.id)}
          />
        ))}
      </RecentModelsGrid>
    </Box>
  );
}
