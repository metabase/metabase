import { Box, Loader, Text } from "metabase/ui";
import type { CardStats } from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";

type RowCountCardProps = {
  lensId: string;
  card: InspectorCard;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
};

export const RowCountCard = ({
  lensId,
  card,
  onStatsReady,
}: RowCountCardProps) => {
  const { data, isLoading } = useLensCardLoader({
    lensId,
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
