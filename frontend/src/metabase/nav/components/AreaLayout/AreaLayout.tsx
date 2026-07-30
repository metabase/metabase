import { useHotkeys } from "@mantine/hooks";
import cx from "classnames";
import type { ReactNode } from "react";

import { Box, Center, Flex, Loader, Stack } from "metabase/ui";

import S from "./AreaLayout.module.css";
import { AreaNavbarHeader } from "./AreaNavbarHeader";

type AreaLayoutProps = {
  logo: ReactNode;
  testId: string;
  isLoading: boolean;
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
  headerControls?: ReactNode;
  upperNav: ReactNode;
  lowerNav?: ReactNode;
  children?: ReactNode;
};

/**
 * Shared layout container for top-level "areas" (Data Studio, Monitor, …).
 */
export function AreaLayout({
  logo,
  testId,
  isLoading,
  isNavbarOpened,
  onNavbarToggle,
  headerControls,
  upperNav,
  lowerNav,
  children,
}: AreaLayoutProps) {
  // Support both sidebar toggle shortcuts for parity with the main app.
  // `[` matches the global shortcut, while `$mod+.` matches the legacy
  // Data Studio shortcut.
  const toggleNavbar = () => onNavbarToggle(!isNavbarOpened);
  useHotkeys([
    ["[", toggleNavbar],
    ["mod+.", toggleNavbar],
  ]);

  if (isLoading) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }

  return (
    <Flex h="100%">
      <Stack
        className={cx(S.nav, { [S.opened]: isNavbarOpened })}
        h="100%"
        p="0.75rem"
        justify="space-between"
        data-testid={testId}
      >
        <Stack gap="md" flex={1} mih={0} className={S.upperGroup}>
          <AreaNavbarHeader
            logo={logo}
            headerControls={headerControls}
            isNavbarOpened={isNavbarOpened}
            onNavbarToggle={onNavbarToggle}
          />
          {upperNav}
        </Stack>
        {lowerNav && <Stack gap="0.75rem">{lowerNav}</Stack>}
      </Stack>
      <Box h="100%" flex={1} miw={0}>
        {children}
      </Box>
    </Flex>
  );
}
