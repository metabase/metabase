import { Loader, Text } from "metabase/ui";

import type { CardStats } from "../../../../types";

type JoinStepStatCellProps = {
  cardStats: CardStats | undefined;
  statKey: string;
};

export const JoinStepStatCell = ({
  cardStats,
  statKey,
}: JoinStepStatCellProps) => {
  if (!cardStats) {
    return <Loader size="xs" />;
  }
  return <Text fw={500}>{cardStats?.[statKey]?.toString() ?? "-"}</Text>;
};
