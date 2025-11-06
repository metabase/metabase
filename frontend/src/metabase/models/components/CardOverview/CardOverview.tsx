import { Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import S from "./CardOverview.module.css";
import { CreatorAndLastEditorSection } from "./CreatorAndLastEditorSection";
import { DescriptionSection } from "./DescriptionSection";
import { QuerySourceSection } from "./QuerySourceSection";
import { VisualizationSection } from "./VisualizationSection";

type CardOverviewProps = {
  card: Card;
};

export function CardOverview({ card }: CardOverviewProps) {
  return (
    <Flex className={S.root} p="xl" pt={0} flex={1}>
      <Flex direction="column" flex={1} mah={700}>
        <VisualizationSection className={S.visualization} card={card} />
      </Flex>
      <Stack maw={300} ml="lg" gap="md" className={S.sidebar}>
        <DescriptionSection card={card} />
        <QuerySourceSection card={card} />
        <CreatorAndLastEditorSection card={card} />
      </Stack>
    </Flex>
  );
}
