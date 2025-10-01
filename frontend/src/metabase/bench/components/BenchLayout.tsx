import type { ReactNode } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";

import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { Box, Center, Flex } from "metabase/ui";

import { ResizeHandle } from "./BenchApp";


export const BenchLayout = (
  { children, nav, name }: {
  children: ReactNode,
  nav: ReactNode,
  name: string;
}) => {
  return (
    <PanelGroup autoSaveId={`${name}-app-layout`} direction="horizontal">
      <Panel
        style={{
          borderRight: "1px solid var(--mb-color-border)",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {nav}
      </Panel>
      <ResizeHandle />
      <Panel
        style={{
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Flex direction="column" h="100%" style={{ overflow: "auto", flex: "1" }}>
          {children}
        </Flex>
      </Panel>
    </PanelGroup>
  )
}

export const EmptySailboat = () => (
  <Center w="100%" h="100%"><NoDataError /></Center>
);
