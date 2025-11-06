import { useMemo } from "react";
import { t } from "ttag";

import Markdown from "metabase/common/components/Markdown";
import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Avatar, Flex, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

import { SemanticLayerVisualization } from "../SemanticLayerVisualization";

import { QuerySourcePath } from "./QuerySourcePath";
import S from "./SemanticEntityOverview.module.css";

interface SemanticEntityOverviewProps {
  card: Card;
}

export function SemanticEntityOverview({ card }: SemanticEntityOverviewProps) {
  const metadata = useSelector(getMetadata);
  const { query, queryInfo } = useMemo(() => {
    const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
    const queryInfo = Lib.queryDisplayInfo(query);
    return { query, queryInfo };
  }, [metadata, card]);

  return (
    <Flex p="xl" pt={0} flex={1} className={S.root}>
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
        {card.description && (
          <Markdown c="text-primary">{card.description}</Markdown>
        )}
        {queryInfo.isEditable && (
          <Stack gap={2}>
            <Text size="sm" fw={700}>
              {t`Based on`}
            </Text>
            <Text>
              <QuerySourcePath query={query} />
            </Text>
          </Stack>
        )}
        {card["last-edit-info"] && (
          <Text>
            {t`Last edited:`}{" "}
            {formatDateTimeWithUnit(card["last-edit-info"].timestamp, "minute")}
          </Text>
        )}
      </Stack>
    </Flex>
  );
}
