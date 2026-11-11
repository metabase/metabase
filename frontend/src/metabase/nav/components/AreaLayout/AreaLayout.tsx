import { useHotkeys } from "@mantine/hooks";
import cx from "classnames";
import {
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
  useState,
} from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

import { Box, Center, Flex, Loader, Stack } from "metabase/ui";

import S from "./AreaLayout.module.css";
import { AreaNavbarHeader } from "./AreaNavbarHeader";

type AreaLayoutProps = {
  logo: ReactNode;
  title?: ReactNode;
  testId: string;
  isLoading: boolean;
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
  headerControls?: ReactNode;
  upperNav: ReactNode;
  lowerNav?: ReactNode;
  children?: ReactNode;
  /** Lets the open nav be resized by dragging its right edge */
  isResizable?: boolean;
  /** Colors every nav icon brand blue, selected or not */
  hasBrandIcons?: boolean;
};

/**
 * Shared layout container for top-level "areas" (Data Studio, Monitor, …).
 */
export function AreaLayout({
  logo,
  title,
  testId,
  isLoading,
  isNavbarOpened,
  onNavbarToggle,
  headerControls,
  upperNav,
  lowerNav,
  children,
  isResizable = false,
  hasBrandIcons = false,
}: AreaLayoutProps) {
  // Support both sidebar toggle shortcuts for parity with the main app.
  // `[` matches the global shortcut, while `$mod+.` matches the legacy
  // Data Studio shortcut.
  const toggleNavbar = () => onNavbarToggle(!isNavbarOpened);
  useHotkeys([
    ["[", toggleNavbar],
    ["mod+.", toggleNavbar],
  ]);
  // Kept here so the width survives collapsing and reopening the nav
  const [navWidth, setNavWidth] = useState(DEFAULT_NAV_WIDTH);

  if (isLoading) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }

  const nav = (
    <Stack
      className={cx(S.nav, {
        [S.opened]: isNavbarOpened && !isResizable,
      })}
      h="100%"
      w={isNavbarOpened && isResizable ? "100%" : undefined}
      p="0.75rem"
      justify="space-between"
      data-testid={testId}
      data-brand-icons={hasBrandIcons || undefined}
    >
      <Stack gap="lg" flex={1} mih={0} className={S.upperGroup}>
        <AreaNavbarHeader
          logo={logo}
          title={title}
          headerControls={headerControls}
          isNavbarOpened={isNavbarOpened}
          onNavbarToggle={onNavbarToggle}
        />
        {upperNav}
      </Stack>
      {lowerNav && <Stack gap="0.75rem">{lowerNav}</Stack>}
    </Stack>
  );

  return (
    <Flex h="100%">
      {isNavbarOpened && isResizable ? (
        <ResizableNav width={navWidth} onWidthChange={setNavWidth}>
          {nav}
        </ResizableNav>
      ) : (
        nav
      )}
      <Box h="100%" flex={1} miw={0}>
        {children}
      </Box>
    </Flex>
  );
}

const MIN_NAV_WIDTH = 232;
const MAX_NAV_WIDTH = 336;
// The fixed width the nav had before it could be resized
const DEFAULT_NAV_WIDTH = 300;

type ResizableNavProps = {
  width: number;
  onWidthChange: (width: number) => void;
  children: ReactNode;
};

/** The open nav, resizable from its right edge */
function ResizableNav({ width, onWidthChange, children }: ResizableNavProps) {
  return (
    <ResizableBox
      className={S.resizable}
      width={width}
      minConstraints={[MIN_NAV_WIDTH, 0]}
      maxConstraints={[MAX_NAV_WIDTH, 0]}
      axis="x"
      resizeHandles={["e"]}
      handle={<NavEdgeHandle />}
      onResizeStart={() => document.body.classList.add(S.noSelect)}
      onResize={(_event: SyntheticEvent, data: ResizeCallbackData) =>
        onWidthChange(data.size.width)
      }
      onResizeStop={() => document.body.classList.remove(S.noSelect)}
    >
      {children}
    </ResizableBox>
  );
}

type NavEdgeHandleProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>;
  /** Injected by react-resizable; kept off the DOM element */
  handleAxis?: string;
};

/** Grab area on the nav's right edge that darkens the border on hover */
function NavEdgeHandle({
  ref,
  handleAxis: _handleAxis,
  ...props
}: NavEdgeHandleProps) {
  return <div ref={ref} className={S.resizeHandle} {...props} />;
}
