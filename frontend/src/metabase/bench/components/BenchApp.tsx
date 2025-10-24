import cx from "classnames";
import type React from "react";
import { type Ref, forwardRef, useEffect, useMemo } from "react";
import type { ResizeHandle as HandleAxis } from "react-resizable";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { replace } from "react-router-redux";

import { BenchLayoutProvider } from "metabase/bench/context/BenchLayoutContext";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_METABOT } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Flex, Stack } from "metabase/ui";

import { OVERVIEW_ITEM, getBenchNavItems } from "../constants/navigation";
import { useRememberBenchTab } from "../hooks/useBenchRememberTab";

import S from "./BenchApp.module.css";
import { BenchAppBar } from "./BenchAppBar";

interface ResizeHandleProps {
  direction?: "horizontal" | "vertical";
  handleSize?: number;
}

export const ResizableBoxHandle = forwardRef(function ResizableBoxHandle(
  {
    direction = "horizontal",
    handleSize = 8,
    ...props
  }: ResizeHandleProps & { handleAxis?: HandleAxis },
  ref: Ref<HTMLDivElement>,
) {
  const { handleAxis, ...rest } = props;
  return (
    <Box
      ref={ref}
      className={cx(S.resizeHandle, {
        [S.resizeHandleHorizontal]: direction === "horizontal",
        [S.resizeHandleVertical]: direction === "vertical",
      })}
      style={{
        width: direction === "horizontal" ? handleSize : undefined,
        height: direction === "vertical" ? handleSize : undefined,
        top: 0,
        left: handleAxis === "e" ? "100%" : undefined,
        transform: direction === "horizontal" ? "translateX(-50%)" : undefined,
      }}
      {...rest}
    />
  );
});

export const ResizeHandle = ({
  direction = "horizontal",
  handleSize = 8,
}: ResizeHandleProps) => {
  return (
    <Box pos="relative">
      <PanelResizeHandle
        className={cx(S.resizeHandle, {
          [S.resizeHandleHorizontal]: direction === "horizontal",
          [S.resizeHandleVertical]: direction === "vertical",
        })}
        style={{
          width: direction === "horizontal" ? handleSize : undefined,
          height: direction === "vertical" ? handleSize : undefined,
        }}
      />
    </Box>
  );
};

export const BenchApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <BenchLayoutProvider>
      <Stack h="100vh" gap={0} style={{ overflow: "hidden" }}>
        <BenchAppBar />
        <Flex flex={1} style={{ overflow: "hidden" }}>
          <PanelGroup
            id="workbench-layout"
            autoSaveId="workbench-layout"
            direction="horizontal"
            className={S.panelGroup}
          >
            <Panel id="bench-main" order={2} className={S.mainPanel}>
              {children}
            </Panel>
            <BenchMetabot />
          </PanelGroup>
        </Flex>
      </Stack>
    </BenchLayoutProvider>
  );
};

export const BenchIndex = () => {
  const { getTab } = useRememberBenchTab();
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);
  const navItems = useMemo(() => getBenchNavItems(isAdmin), [isAdmin]);

  useEffect(() => {
    const tabId = getTab();
    const navItem =
      (tabId && navItems.find((navItem) => navItem.id === tabId)) ||
      OVERVIEW_ITEM;
    dispatch(replace(navItem.url));
  }, [dispatch, getTab, navItems]);
  return null;
};

function BenchMetabot() {
  const metabot = PLUGIN_METABOT.useMetabotAgent();

  if (!metabot?.visible) {
    return null;
  }
  return (
    <>
      <ResizeHandle />
      <Panel
        id="bench-metabot"
        maxSize={24}
        minSize={10}
        className={S.metabotPanel}
        order={9}
      >
        <PLUGIN_METABOT.Metabot
          w="100%"
          config={{ hideSuggestedPrompts: true }}
        />
      </Panel>
    </>
  );
}
