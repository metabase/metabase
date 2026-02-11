import { Loader, Text } from "metabase/ui";
import type { CardStats } from "metabase-lib/transforms-inspector";
import type { InspectorCard, InspectorLens } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";

type TableCountCardProps = {
  lens: InspectorLens;
  card: InspectorCard;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
};

export const TableCountCard = ({
  card,
  lens,
  onStatsReady,
}: TableCountCardProps) => {
  const { data, isLoading } = useLensCardLoader({
    lensId: lens.id,
    card,
    onStatsReady,
  });

  const tableCount = data?.data?.rows?.[0]?.[0];

  if (isLoading) {
    return <Loader size="xs" />;
  }

  return <Text>{tableCount?.toString() ?? "-"}</Text>;
};
