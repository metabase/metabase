import { t } from "ttag";

import { Flex, Loader, Text } from "metabase/ui";
import type { CardStats } from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";

type TableCountCardProps = {
  lensId: string;
  card: InspectorCard;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
};

export const TableCountCard = ({
  lensId,
  card,
  onStatsReady,
}: TableCountCardProps) => {
  const { data, isLoading } = useLensCardLoader({
    lensId,
    card,
    onStatsReady,
  });

  const tableCount = data?.data?.rows?.[0]?.[0];

  if (isLoading) {
    return <Loader size="xs" />;
  }

  if (tableCount == null) {
    return null;
  }

  return (
    <Flex gap="xs" align="center">
      <Text size="sm" c="text-secondary">{t`Table rows:`}</Text>
      <Text size="sm" fw={500}>
        {tableCount.toString()}
      </Text>
    </Flex>
  );
};
