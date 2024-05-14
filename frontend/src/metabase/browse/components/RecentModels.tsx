import { t } from "ttag";

import PinnedItemCard from "metabase/collections/components/PinnedItemCard";
import { Box, Grid, Text } from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

export function RecentModels({ models }: { models: RecentItem[] }) {
  if (models.length === 0) {
    return null;
  }

  return (
    <Box my="lg">
      <Text
        fw="bold"
        size={16}
        color="text-dark"
        mb="lg"
      >{t`Recent models`}</Text>
      <Grid gutter="sm">
        {models.map(model => (
          <Grid.Col span={3} key={model.id}>
            <PinnedItemCard item={model} />
          </Grid.Col>
        ))}
      </Grid>
    </Box>
  );
}
