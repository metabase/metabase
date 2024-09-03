import { t } from "ttag";

import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import { Box, Text } from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import type { RecentCollectionItem } from "metabase-types/api";

import { RecentModelsGrid } from "./RecentModels.styled";

export function RecentMetrics({
  metrics = [],
  skeleton,
}: {
  metrics?: RecentCollectionItem[];
  skeleton?: boolean;
}) {
  if (!skeleton && metrics.length === 0) {
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
      data-testid="recent-metric"
    >
      <Text
        id={skeleton ? undefined : headingId}
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
          metrics.map(metric => (
            <PinnedItemCard key={metric.id} item={metric} />
          ))
        )}
      </RecentModelsGrid>
    </Box>
  );
}
