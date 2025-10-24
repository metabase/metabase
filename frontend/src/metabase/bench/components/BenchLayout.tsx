import { useDisclosure } from "@mantine/hooks";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
} from "react";

import { useBenchLayoutContext } from "metabase/bench/context/BenchLayoutContext";
import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { Box, Center, Flex } from "metabase/ui";

import S from "./BenchLayout.module.css";
import { BenchSideNav } from "./BenchSideNav";

export const BenchLayout = ({
  children,
  nav,
  name,
}: {
  children: ReactNode;
  nav?: ReactElement;
  name: string;
}) => {
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
    <Flex id={`${name}-app-layout`} h="100%">
      {nav && !isCollapsed && (
        <BenchSideNav>
          <Box className={S.navPanel}>{nav}</Box>
        </BenchSideNav>
      )}
      <Flex direction="column" h="100%" style={{ overflow: "auto" }} flex={1}>
        {children}
      </Flex>
    </Flex>
  );
};

export const EmptySailboat = () => (
  <Center w="100%" h="100%">
    <NoDataError />
  </Center>
);
