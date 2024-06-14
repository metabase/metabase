import { Box, Flex, Group } from "metabase/ui";

import { VisualizerCanvas } from "./VisualizerCanvas";
import { VisualizerMenu } from "./VisualizerMenu/VisualizerMenu";
import { VisualizerUsed } from "./VisualizerUsed";

export function Visualizer() {
  return (
    <Group align="top" p="xl">
      {/* TODO - allow for snap resizing to set this width */}
      <Box w={340} h="90vh">
        <VisualizerMenu />
        <Box mt="md">
          <VisualizerUsed />
        </Box>
      </Box>
      <Flex style={{ flex: 1 }}>
        <VisualizerCanvas />
      </Flex>
    </Group>
  );
}
