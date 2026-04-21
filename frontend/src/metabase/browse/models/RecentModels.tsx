import { t } from "ttag";

import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import { Box, Repeat, Text } from "metabase/ui";
import type { RecentCollectionItem } from "metabase-types/api";

import S from "./RecentModels.module.css";
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
      <div className={S.recentModelsGrid}>
        {skeleton ? (
          <Repeat times={2}>
            <PinnedItemCard skeleton iconForSkeleton="model" />
          </Repeat>
        ) : (
          models.map((model) => (
            <PinnedItemCard
              key={`model-${model.id}`}
              item={model}
              onClick={() => trackModelClick(model.id)}
            />
          ))
        )}
      </div>
    </Box>
  );
}
