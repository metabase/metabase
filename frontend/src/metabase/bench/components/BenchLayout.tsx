import { useDisclosure } from "@mantine/hooks";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  type ImperativePanelHandle,
  Panel,
  PanelGroup,
} from "react-resizable-panels";

import { useBenchLayoutContext } from "metabase/bench/context/BenchLayoutContext";
import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { Center, Flex } from "metabase/ui";

import { ResizeHandle } from "./BenchApp";
import S from "./BenchLayout.module.css";

export const BenchLayout = ({
  children,
  nav,
  name,
}: {
  children: ReactNode;
  nav?: ReactElement;
  name: string;
}) => {
  const navPanelRef = useRef<ImperativePanelHandle>(null);
  const [isCollapsed, { toggle: toggleCollapsed }] = useDisclosure(false);
  const { registerPanelControl } = useBenchLayoutContext();

  const stableToggleCollapsed = useCallback(() => {
    toggleCollapsed();
  }, [toggleCollapsed]);

  useEffect(() => {
    if (nav) {
      return registerPanelControl(stableToggleCollapsed, isCollapsed);
    }
  }, [isCollapsed, nav, registerPanelControl, stableToggleCollapsed]);

  return (
    <PanelGroup
      id={`${name}-app-layout`}
      autoSaveId={`${name}-app-layout`}
      direction="horizontal"
    >
      {nav && !isCollapsed && (
        <>
          <Panel
            ref={navPanelRef}
            id="bench-app-nav"
            order={1}
            defaultSize={20}
            minSize={10}
            maxSize={25}
            className={S.navPanel}
          >
            {nav}
          </Panel>
          <ResizeHandle />
        </>
      )}
      <Panel id="bench-app-main" order={2} className={S.mainPanel}>
        <Flex direction="column" h="100%" style={{ overflow: "auto" }} flex={1}>
          {children}
        </Flex>
      </Panel>
    </PanelGroup>
  );
};

export const EmptySailboat = () => (
  <Center w="100%" h="100%">
    <NoDataError />
  </Center>
);
