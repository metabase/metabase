import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Center, Flex, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { getVisualizerRawSeries } from "metabase/visualizer/visualizer.slice";

export function VisualizationCanvas() {
  const rawSeries = useSelector(getVisualizerRawSeries);
  const hasSeriesToShow = rawSeries.length > 0;

  return (
    <Flex
      w="100%"
      h="100%"
      direction="column"
      bg="white"
      style={{ borderRadius: "var(--default-border-radius)" }}
    >
      {hasSeriesToShow ? (
        <Visualization rawSeries={rawSeries} />
      ) : (
        <Center h="100%" w="100%" mx="auto">
          <Text>{t`Visualization will appear here`}</Text>
        </Center>
      )}
    </Flex>
  );
}
