import Markdown from "metabase/common/components/Markdown";
import { Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { SemanticLayerVisualization } from "../SemanticLayerVisualization";

import { CreatorAndLastEditorInfo } from "./CreatorAndLastEditorInfo";
import { QuerySourceInfo } from "./QuerySourceInfo";
import S from "./SemanticEntityOverview.module.css";

interface SemanticEntityOverviewProps {
  card: Card;
}

export function SemanticEntityOverview({ card }: SemanticEntityOverviewProps) {
  return (
    <Flex p="xl" pt={0} flex={1} className={S.root}>
      <Flex direction="column" flex={1} mah={700}>
        <SemanticLayerVisualization card={card} className={S.visualization} />
      </Flex>
      <Stack w={300} ml="lg" gap="md" className={S.sidebar}>
        {card.description && (
          <Markdown c="text-primary">{card.description}</Markdown>
        )}
        <QuerySourceInfo card={card} />
        <CreatorAndLastEditorInfo card={card} />
      </Stack>
    </Flex>
  );
}
