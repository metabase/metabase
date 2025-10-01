import { index } from "d3";
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
  return (
    <Stack h="100vh" style={{ overflow: "hidden" }} gap={0}>
      <BenchAppBar
        onMetabotToggle={() => {}}
        isMetabotOpen={false}
        onSidebarToggle={() => {}}
        isSidebarOpen={false}
      />
      <PanelGroup autoSaveId="workbench-panels" direction="horizontal">
        <Panel
          key={`resizable-box-${index}`}
          collapsible={true} collapsedSize={5} minSize={10}
          style={{ overflow: "hidden"}}
        >
          <BenchNav />
        </Panel>
        <ResizeHandle />
        <Panel>
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
      <Panel maxSize={30} style={{ height: "100%"}}>
          <PLUGIN_METABOT.Metabot w="100%" />
      </Panel>
    </>
  )
}
