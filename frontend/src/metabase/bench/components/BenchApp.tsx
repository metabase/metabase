import { useDisclosure } from "@mantine/hooks";
import type React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Group, Stack, rem } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks"; // TODO: how to make this work in non-enterprise?

import { BenchAppBar } from "./BenchAppBar";
import { BenchNav } from "./BenchNav";

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
  const [showBenchNav, { toggle }] = useDisclosure(true);

  return (
    <Group
      h="100vh"
      style={{ overflow: "hidden" }}
      gap={0}
      justify="stretch"
      align="stretch"
      wrap="nowrap"
    >
      {showBenchNav && (
        <Box
          id="bench-nav"
          style={{
            overflow: "auto",
            height: "100%",
            width: rem(240),
            flexShrink: 0,
          }}
        >
          <BenchNav />
        </Box>
      )}
      <Stack
        gap={0}
        style={{
          flex: 1,
          height: "100%",
          width: showBenchNav ? `calc(100% - ${rem(240)})` : "100%",
          position: "relative",
        }}
      >
        <BenchAppBar onSidebarToggle={toggle} isSidebarOpen={showBenchNav} />
        <PanelGroup
          id="workbench-layout"
          autoSaveId="workbench-layout"
          direction="horizontal"
          style={{ width: "100%" }}
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
      </Stack>
    </Group>
  );
};

function BenchMetabot() {
  const metabot = useMetabotAgent();

  if (!metabot.visible) {
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
