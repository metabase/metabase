import { ActionIcon } from "@mantine/core";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Flex, Icon, Title } from "metabase/ui";
import BaseVisualization from "metabase/visualizations/components/Visualization";
import type { Series } from "metabase-types/api";

import { useVizSettings } from "../useVizSettings";

export function VisualizerCanvas({ series }: { series: Series }) {
  const { openVizSettings } = useVizSettings();
  const metadata = useSelector(getMetadata);

  return (
    <Card w="100%" h="100%">
      {series.length > 0 && (
        <>
          <Flex mx="xs">
            <Title mb="md">{series[0].card.name}</Title>
            <ActionIcon ml="auto" onClick={() => openVizSettings()}>
              <Icon name="gear" />
            </ActionIcon>
          </Flex>
          <BaseVisualization rawSeries={series} metadata={metadata} />
        </>
      )}
    </Card>
  );
}
