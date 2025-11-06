import Markdown from "metabase/common/components/Markdown";
import { Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import S from "./CardOverview.module.css";
import { CardOverviewVisualization } from "./CardOverviewVisualization";
import { CreatorAndLastEditorInfo } from "./CreatorAndLastEditorInfo";
import { QuerySourceInfo } from "./QuerySourceInfo";

interface CardOverviewProps {
  card: Card;
}

export function CardOverview({ card }: CardOverviewProps) {
  return (
    <Flex p="xl" pt={0} flex={1} className={S.root}>
      <Flex direction="column" flex={1} mah={700}>
        <CardOverviewVisualization card={card} className={S.visualization} />
      </Flex>
      <Stack maw={300} ml="lg" gap="md" className={S.sidebar}>
        {card.description && (
          <Markdown c="text-primary">{card.description}</Markdown>
        )}
        <QuerySourceInfo card={card} />
        <CreatorAndLastEditorInfo card={card} />
      </Stack>
    </Flex>
  );
}
