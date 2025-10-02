import { useDisclosure } from "@mantine/hooks";
import type React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Stack } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { BenchAppBar } from "./BenchAppBar"
import { BenchNav } from "./BenchNav";

export const ResizeHandle =  () => (
  <PanelResizeHandle style={{ cursor: "col-resize", height: "100%", width: 4 }} />
)


export const BenchApp = ({ children }: { children: React.ReactNode }) => {
  const [showBenchNav, { toggle }] = useDisclosure(true);
  return (
    <Stack h="100vh" style={{ overflow: "hidden" }} gap={0}>
      <BenchAppBar
        onSidebarToggle={toggle}
        isSidebarOpen={showBenchNav}
      />
      <PanelGroup autoSaveId="workbench-layout" direction="horizontal">
        {showBenchNav && (
          <>
            <Panel
              id="bench-nav"
              collapsible={true} collapsedSize={5} minSize={10}
              style={{ overflow: "hidden"}}
            >
              <BenchNav />
            </Panel>
            <ResizeHandle />
          </>
        )}
        <Panel id="bench-main">
          {children}
        </Panel>
        <BenchMetabot />
      </PanelGroup>
    </Stack>
  )
}

function BenchMetabot() {
  const metabot = useMetabotAgent();

  if(!metabot.visible) {
    return null;
  }
  return (
    <>
      <ResizeHandle />
      <Panel id="bench-metabot"maxSize={30} style={{ height: "100%"}}>
          <PLUGIN_METABOT.Metabot w="100%" />
      </Panel>
    </>
  )
}
