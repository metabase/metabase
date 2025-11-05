import { t } from "ttag";

import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";
import { Avatar, Flex, Stack, Text } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { SemanticLayerVisualization } from "../SemanticLayerVisualization";

import S from "./SemanticEntityOverview.module.css";
import { useTablePath } from "./hooks";

interface SemanticEntityOverviewProps {
  card: Card;
}

export function SemanticEntityOverview({ card }: SemanticEntityOverviewProps) {
  const tablePath = useTablePath(card.table_id);

  return (
    <Flex p="lg" flex={1} className={S.root}>
      <Flex direction="column" flex={1} mah={700}>
        <SemanticLayerVisualization card={card} className={S.visualization} />
      </Flex>
      <Stack w={300} ml="lg" gap="md" className={S.sidebar}>
        {card.creator && (
          <Flex gap="sm" align="center">
            <Avatar name={card.creator.common_name} color="brand" size="md" />
            <Stack gap={0}>
              <Text size="sm" mt="xs" c="text-secondary">
                {t`Owner`}
              </Text>
              <Text c="text-secondary">{card.creator.common_name}</Text>
            </Stack>
          </Flex>
        )}
        {card.description && <Text>{card.description}</Text>}
        {tablePath && (
          <Stack gap={2}>
            <Text size="sm" fw={700}>
              {t`Based on`}
            </Text>
            <Text>{tablePath}</Text>
          </Stack>
        )}
        {card.updated_at && (
          <Text>
            {t`Last edited:`}{" "}
            {formatDateTimeWithUnit(card.updated_at, "minute")}
          </Text>
        )}
      </Stack>
    </Flex>
  );
}
