import { index } from "d3";
import type React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { Box, Flex , Stack } from "metabase/ui";

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
      </PanelGroup>
    </Stack>
  )
}
