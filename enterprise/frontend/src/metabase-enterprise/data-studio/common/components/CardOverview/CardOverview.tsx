import { EntityCreationInfo } from "metabase/common/components/EntityCreationInfo";
import { Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { OverviewVisualization } from "../OverviewVisualization";

import S from "./CardOverview.module.css";
import { DescriptionSection } from "./DescriptionSection";
import { QuerySourceSection } from "./QuerySourceSection";

type CardOverviewProps = {
  card: Card;
};

export function CardOverview({ card }: CardOverviewProps) {
  return (
    <Flex className={S.root} p="lg" flex={1} bg="bg-light">
      <Flex direction="column" flex={1} mah={700}>
        <OverviewVisualization card={card} />
      </Flex>
      <Stack maw={300} ml="lg" gap="lg" className={S.sidebar}>
        <DescriptionSection card={card} />
        <QuerySourceSection card={card} />
        <EntityCreationInfo
          createdAt={card.created_at}
          creator={card.creator}
          lastEditedAt={card["last-edit-info"]?.timestamp}
          lastEditor={card["last-edit-info"]}
        />
      </Stack>
    </Flex>
  );
}
