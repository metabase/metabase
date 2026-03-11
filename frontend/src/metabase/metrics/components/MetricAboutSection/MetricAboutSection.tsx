import { EntityCreationInfo } from "metabase/common/components/EntityCreationInfo";
import { OverviewVisualization } from "metabase/data-studio/common/components/OverviewVisualization";
import { DescriptionSection } from "metabase/metrics/components/DescriptionSection";
import { QuerySourceSection } from "metabase/metrics/components/QuerySourceSection";
import { Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import S from "./MetricAboutSection.module.css";

type MetricAboutSectionProps = {
  card: Card;
};

export function MetricAboutSection({ card }: MetricAboutSectionProps) {
  return (
    <Flex className={S.root} flex={1}>
      <Flex direction="column" flex={1} mah={700}>
        <OverviewVisualization card={card} />
      </Flex>
      <Stack w={300} ml="lg" gap="lg" className={S.sidebar}>
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
