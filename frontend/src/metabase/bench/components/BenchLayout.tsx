import { useDisclosure } from "@mantine/hooks";
import { type ReactElement, type ReactNode, cloneElement, useRef } from "react";
import { type ImperativePanelHandle, Panel, PanelGroup } from "react-resizable-panels";
import { t } from "ttag";

import { NoDataError } from "metabase/common/components/errors/NoDataError";
import {  ActionIcon, Box, Center, Flex, Icon } from "metabase/ui";

import { ResizeHandle } from "./BenchApp";
import { useAbsoluteSize } from "./utils";

const CollapsedNav = ({ onClick }: { onClick: () => void }) => (
  <Box h="100%" ta="center" pt="sm">
    <ActionIcon onClick={onClick} aria-label={t`Expand`} color="brand">
      <Icon name="arrow_right" c="brand" />
    </ActionIcon>
  </Box>
);

export const BenchLayout = ({
  children, nav, name
}: {
  children: ReactNode;
  nav: ReactElement;
  name: string;
}) => {
  const navPanelRef = useRef<ImperativePanelHandle>(null);
  const [isCollapsed, {open: expand, close: collapse}] = useDisclosure(false);
  const getSize = useAbsoluteSize({ groupId: `${name}-app-layout` });

  const expandPanel = () => {
    navPanelRef.current?.expand();
  };

  const collapsePanel = () => {
    navPanelRef.current?.collapse();
  };

  return (
    <PanelGroup id={`${name}-app-layout`} autoSaveId={`${name}-app-layout`} direction="horizontal">
      <Panel
        ref={navPanelRef}
        id="bench-app-nav"
        order={1}
        collapsible
        onCollapse={collapse}
        onExpand={expand}
        collapsedSize={getSize(32)}
        minSize={15}
        style={{
          borderRight: "1px solid var(--mb-color-border)",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {isCollapsed ? cloneElement(nav, { onCollapse: collapsePanel}) : <CollapsedNav onClick={expandPanel} /> }
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
