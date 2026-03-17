import { OverviewVisualization } from "metabase/data-studio/common/components/OverviewVisualization";
import { Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { DescriptionSection } from "./DescriptionSection";
import S from "./MetricOverview.module.css";

type MetricOverviewProps = {
  card: Card;
};

export function MetricOverview({ card }: MetricOverviewProps) {
  return (
    <Flex className={S.root} flex={1}>
      <Flex direction="column" flex={1} mah={700}>
        <OverviewVisualization card={card} />
      </Flex>
      <Stack flex="0 0 360px" className={S.descriptionSection} mah={700}>
        <DescriptionSection card={card} />
      </Stack>
    </Flex>
  );
}
