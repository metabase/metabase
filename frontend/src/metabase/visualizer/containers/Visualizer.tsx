import { useState } from "react";

import { Box, Flex, Group } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { VisualizerCanvas } from "./VisualizerCanvas";
import { VisualizerMenu } from "./VisualizerMenu/VisualizerMenu";
import { VisualizerUsed } from "./VisualizerUsed";

export function Visualizer() {
  const [used, setUsed] = useState<SearchResult[]>([]);

  function onSetUsed(item: SearchResult) {
    setUsed([item]);
  }
  return (
    <Group align="top" p="xl">
      {/* TODO - allow for snap resizing to set this width */}
      <Box w={340} h="90vh">
        <VisualizerMenu setUsed={onSetUsed} />
        <Box mt="md">
          <VisualizerUsed used={used} />
        </Box>
      </Box>
      <Flex style={{ flex: 1 }}>
        <VisualizerCanvas used={used} />
      </Flex>
    </Group>
  );
}
