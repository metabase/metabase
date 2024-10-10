import { useCallback } from "react";

import { Box, Flex, Stack } from "metabase/ui";
import type { CardId } from "metabase-types/api";

import { DataImporter } from "../DataImporter";
import { DataManager } from "../DataManager";
import { VisualizationCanvas } from "../VisualizationCanvas";

export const VisualizerPage = () => {
  const handleSelectDataSource = useCallback((_cardId: CardId) => {
    // load cards
  }, []);

  return (
    <Box style={{ height: "100%", display: "flex" }}>
      <Flex style={{ flexGrow: 1, minHeight: "0" }}>
        <Stack
          mih={0}
          w={320}
          style={{
            overflowY: "auto",
          }}
        >
          <DataImporter onSelect={handleSelectDataSource} />
          <DataManager cards={[]} />
        </Stack>
        <Box
          component="main"
          mih={0}
          style={{
            flexGrow: 1,
            overflowY: "auto",
          }}
        >
          <VisualizationCanvas />
        </Box>
      </Flex>
    </Box>
  );
};
