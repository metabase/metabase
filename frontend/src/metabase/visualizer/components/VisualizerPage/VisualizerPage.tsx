import { Box, Flex } from "metabase/ui";

import { DataImporter } from "../DataImporter";
import { DataManager } from "../DataManager";
import { VisualizationCanvas } from "../VisualizationCanvas";

export const VisualizerPage = () => {
  return (
    <Flex style={{ height: "100%", overflow: "hidden" }}>
      <Flex direction="column" w={320}>
        <Box h="50%" p={10} pr={0} style={{ overflowY: "hidden" }}>
          <DataImporter />
        </Box>
        <Box h="50%" pl={10} pb={10} style={{ overflowY: "auto" }}>
          <DataManager />
        </Box>
      </Flex>
      <Box
        component="main"
        w="100%"
        h="100%"
        p={10}
        style={{ overflowY: "hidden" }}
      >
        <VisualizationCanvas />
      </Box>
    </Flex>
  );
};
