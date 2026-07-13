import { Box } from "metabase/ui";

import { VisualizationRunningState } from "./QueryVisualization";

export const DevRunningStateScaffold = () => (
  <Box
    pos="relative"
    w="100vw"
    h="100vh"
    data-testid="dev-running-state-scaffold"
  >
    <VisualizationRunningState />
  </Box>
);
