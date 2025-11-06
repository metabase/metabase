import { Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import S from "./CardOverview.module.css";
import { CreatorAndLastEditorSection } from "./CreatorAndLastEditorSection";
import { DescriptionSection } from "./DescriptionSection";
import { QuerySourceSection } from "./QuerySourceSection";
import { VisualizationSection } from "./VisualizationSection";

interface CardOverviewProps {
  card: Card;
}

export function CardOverview({ card }: CardOverviewProps) {
  return (
    <Flex p="xl" pt={0} flex={1} className={S.root}>
      <Flex direction="column" flex={1} mah={700}>
        <VisualizationSection card={card} className={S.visualization} />
      </Flex>
      <Stack maw={300} ml="lg" gap="md" className={S.sidebar}>
        <DescriptionSection card={card} />
        <QuerySourceSection card={card} />
        <CreatorAndLastEditorSection card={card} />
      </Stack>
    </Flex>
  );
}
