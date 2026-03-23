import { Loader, Text } from "metabase/ui";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";

type TableCountCardProps = {
  card: InspectorCard;
};

export const TableCountCard = ({ card }: TableCountCardProps) => {
  const { data, isLoading } = useLensCardLoader({ card });

  const tableCount = data?.data?.rows?.[0]?.[0];

  if (isLoading) {
    return <Loader size="xs" />;
  }

  return <Text>{tableCount?.toString() ?? "-"}</Text>;
};
