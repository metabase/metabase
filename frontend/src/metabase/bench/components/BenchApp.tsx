import { useDisclosure } from "@mantine/hooks";
import type React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Stack } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { BenchAppBar } from "./BenchAppBar";
import { BenchNav } from "./BenchNav";
import { useAbsoluteSize } from "./utils";

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
      <PanelResizeHandle style={{ position: "absolute", zIndex: 9, ...directionProps[direction] }} />
    </Box>
  );
};


export const BenchApp = ({ children }: { children: React.ReactNode }) => {
  const [showBenchNav, { toggle }] = useDisclosure(true);
  const getSize = useAbsoluteSize({ groupId: "workbench-layout" });

  return (
    <Stack h="100vh" style={{ overflow: "hidden" }} gap={0}>
      <BenchAppBar onSidebarToggle={toggle} isSidebarOpen={showBenchNav} />
      <PanelGroup id="workbench-layout" autoSaveId="workbench-layout" direction="horizontal" style={{ width: '100%' }}>
        {showBenchNav && (
          <>
            <Panel
              id="bench-nav"
              order={1}
              collapsible={true}
              collapsedSize={getSize(64)}
              minSize={15}
              style={{ overflow: "hidden" }}
            >
              <BenchNav />
            </Panel>
            <ResizeHandle />
          </>
        )}
        <Panel id="bench-main" order={2}>{children}</Panel>
        <BenchMetabot />
      </PanelGroup>
    </Stack>
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
      <Panel id="bench-metabot" maxSize={30} style={{ height: "100%" }} order={9}>
        <PLUGIN_METABOT.Metabot
          w="100%"
          config={{ hideSuggestedPrompts: true }}
        />
      </Panel>
    </>
  );
}


