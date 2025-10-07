import { useDisclosure } from "@mantine/hooks";
import type React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Stack } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

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

  return <PanelResizeHandle style={directionProps[direction]} />;
};

export const BenchApp = ({ children }: { children: React.ReactNode }) => {
  const [showBenchNav, { toggle }] = useDisclosure(true);
  return (
    <Stack h="100vh" style={{ overflow: "hidden" }} gap={0}>
      <BenchAppBar onSidebarToggle={toggle} isSidebarOpen={showBenchNav} />
      <PanelGroup autoSaveId="workbench-layout" direction="horizontal">
        {showBenchNav && (
          <>
            <Panel
              id="bench-nav"
              order={1}
              collapsible={true}
              collapsedSize={5}
              minSize={10}
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
