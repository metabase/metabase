import { Box, Loader, Text } from "metabase/ui";
import type { InspectorCard } from "metabase-types/api";

import { useLensCardLoader } from "../../../../hooks";

type RowCountCardProps = {
  card: InspectorCard;
};

export const RowCountCard = ({ card }: RowCountCardProps) => {
  const { data, isLoading } = useLensCardLoader({ card });

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
