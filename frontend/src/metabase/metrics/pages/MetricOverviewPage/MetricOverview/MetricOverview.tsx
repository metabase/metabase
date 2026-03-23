import { OverviewVisualization } from "metabase/data-studio/common/components/OverviewVisualization";
import { Flex, Stack } from "metabase/ui";
import type { Card } from "metabase-types/api";

import type { MetricUrls } from "../../../types";

import { DescriptionSection } from "./DescriptionSection";
import S from "./MetricOverview.module.css";

interface MetricOverviewProps {
  card: Card;
  urls: MetricUrls;
}

export function MetricOverview({ card, urls }: MetricOverviewProps) {
  return (
    <Flex className={S.root} flex={1}>
      <Flex direction="column" flex={1} mah={700}>
        <OverviewVisualization card={card} />
      </Flex>
      <Stack flex="0 0 360px" className={S.descriptionSection} mah={700}>
        <DescriptionSection card={card} urls={urls} />
      </Stack>
    </Flex>
  );
}
