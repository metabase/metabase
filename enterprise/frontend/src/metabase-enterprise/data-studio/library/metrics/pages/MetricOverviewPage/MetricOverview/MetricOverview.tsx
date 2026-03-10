import { EntityCreationInfo } from "metabase/common/components/EntityCreationInfo";
import { Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { MetricDimensionGrid } from "../MetricDimensionGrid";

import { DescriptionSection } from "./DescriptionSection";
import S from "./MetricOverview.module.css";
import { QuerySourceSection } from "./QuerySourceSection";

type MetricOverviewProps = {
  card: Card;
};

export function MetricOverview({ card }: MetricOverviewProps) {
  return (
    <Flex className={S.root} flex={1}>
      <Flex direction="column" flex={1}>
        {card.id != null && <MetricDimensionGrid metricId={card.id} />}
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
