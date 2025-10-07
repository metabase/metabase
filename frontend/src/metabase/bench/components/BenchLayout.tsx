import type { ReactNode } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";

import { NoDataError } from "metabase/common/components/errors/NoDataError";
import {  Center, Flex } from "metabase/ui";

import { ResizeHandle } from "./BenchApp";


export const BenchLayout = ({
  children, nav, name
}: {
  children: ReactNode;
  nav: ReactNode;
  name: string;
}) => {
  return (
    <PanelGroup autoSaveId={`${name}-app-layout`} direction="horizontal" style={{ position: "relative" }}>
      <Panel
        id="bench-app-nav"
        order={1}
        collapsible
        collapsedSize={5}
        minSize={10}
        style={{
          borderRight: "1px solid var(--mb-color-border)",
          height: "100%",
          overflow: "hidden",
        }}
      >
        { nav }
      </Panel>
      <ResizeHandle />
      <Panel
        id="bench-app-main"
        order={2}
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
