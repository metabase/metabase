import { useDisclosure } from "@mantine/hooks";
import type React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { BenchLayoutProvider } from "metabase/bench/context/BenchLayoutContext";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Stack } from "metabase/ui";

import { BenchAppBar } from "./BenchAppBar";

export const ResizeHandle = ({
  direction = "horizontal",
  handleSize = 8,
}: {
  direction?: "horizontal" | "vertical";
  handleSize?: number;
}) => {
  const directionProps = {
    horizontal: { cursor: "col-resize", height: "100%", width: handleSize },
    vertical: { cursor: "row-resize", width: "100%", height: handleSize },
  };

  return (
    <Box pos="relative">
      <PanelResizeHandle
        style={{
          position: "absolute",
          zIndex: 9,
          ...directionProps[direction],
        }}
      />
    </Box>
  );
};

export const BenchApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <BenchLayoutProvider>
      <Stack h="100vh" gap={0} style={{ overflow: "hidden" }}>
        <BenchAppBar />
        <Box style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          <PanelGroup
            id="workbench-layout"
            autoSaveId="workbench-layout"
            direction="horizontal"
            style={{ width: "100%", height: "100%" }}
          >
            <Panel
              id="bench-main"
              order={2}
              style={{
                overflow: "auto",
              }}
            >
              {children}
            </Panel>
            <BenchMetabot />
          </PanelGroup>
        </Box>
      </Stack>
    </BenchLayoutProvider>
  );
};

function BenchMetabot() {
  const metabot = PLUGIN_METABOT.useMetabotAgent();

  if (!metabot?.visible) {
    return null;
  }
  return (
    <>
      <ResizeHandle />
      <Panel
        id="bench-metabot"
        maxSize={30}
        minSize={10}
        style={{ height: "100%" }}
        order={9}
      >
        <PLUGIN_METABOT.Metabot
          w="100%"
          config={{ hideSuggestedPrompts: true }}
        />
      </Panel>
    </>
  );
}
