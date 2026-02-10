import { Box, Loader, Text } from "metabase/ui";
import type { CardStats } from "metabase-lib/transforms-inspector";
import type { InspectorCard, InspectorLens } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";

type RowCountCardProps = {
  lens: InspectorLens;
  card: InspectorCard;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
};

export const RowCountCard = ({
  card,
  lens,
  onStatsReady,
}: RowCountCardProps) => {
  const { data, isLoading } = useLensCardLoader({
    lensId: lens.id,
    card,
    onStatsReady,
  });

  const rowCount = data?.data?.rows?.[0]?.[0];

  if (isLoading) {
    return (
      <Box ta="right">
        <Loader size="xs" />
      </Box>
    );
  }

  return (
    <Text size="sm" ta="right">
      {rowCount?.toString() ?? "-"}
    </Text>
  );
};
