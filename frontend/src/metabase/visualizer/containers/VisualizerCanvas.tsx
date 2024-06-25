import { useEffect, useState, useCallback } from "react";
import { cardApi } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Card, Flex, Icon, Title } from "metabase/ui";

import { getMetadata } from "metabase/selectors/metadata";
import BaseVisualization from "metabase/visualizations/components/Visualization";
import type { SearchResult, Series } from "metabase-types/api";
import { ActionIcon } from "@mantine/core";

import { useVizSettings } from "../useVizSettings";

export function VisualizerCanvas({
  used,
}: {
  used: SearchResult[] | undefined;
}) {
  const [chart, setChart] = useState<Series>();
  const dispatch = useDispatch();

  const { openVizSettings } = useVizSettings();

  const handleAddUsed = async (result: SearchResult) => {
    if (!result) {
      return;
    }

    // const { data: cardData } = await dispatch(
    //   cardApi.endpoints.getCard.initiate({
    //     id: Number(result.id),
    //   }),
    // );

    // if (!cardData) {
    //   return;
    // }

    const { data: dataset } = await dispatch(
      cardApi.endpoints.cardQuery.initiate(Number(result.id)),
    );

    if (!dataset) {
      return;
    }

    const series = {
      card: {
        ...result,
      },
      data: dataset.data,
    };

    setChart(series);
  };

  useEffect(() => {
    if (!used) {
      return;
    }
    handleAddUsed(used[0]);
  }, [used]);

  const metadata = useSelector(getMetadata);

  return (
    <Card w="100%" h="100%">
      {chart && (
        <>
          <Flex mx="xs">
            <Title mb="md">{chart?.card.name}</Title>
            <ActionIcon ml="auto" onClick={() => openVizSettings()}>
              <Icon name="gear" />
            </ActionIcon>
          </Flex>
          <BaseVisualization rawSeries={[{ ...chart }]} metadata={metadata} />
        </>
      )}
    </Card>
  );
}
