import { useHotkeys } from "@mantine/hooks";
import cx from "classnames";
import type { ReactNode } from "react";

import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { Box, Flex, Skeleton, Stack } from "metabase/ui";

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
    return <AreaLayoutSkeleton isNavbarOpened={isNavbarOpened} />;
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
      <Box h="100%" flex={1} miw={0}>
        {children}
      </Box>
    </Flex>
  );
}

const NAV_TABS_SKELETON_COUNT = 6;

/** The area's navbar, while what it needs to lay itself out loads. */
function AreaLayoutSkeleton({ isNavbarOpened }: { isNavbarOpened: boolean }) {
  return (
    <Flex h="100%">
      <LoadingSkeleton
        className={cx(S.nav, { [S.opened]: isNavbarOpened })}
        h="100%"
        p="0.75rem"
        gap="lg"
      >
        <Flex align="center" gap="sm" mt="sm" mb="0.75rem">
          <Skeleton h="2rem" w="2rem" circle />
          {isNavbarOpened && <Skeleton h={14} w={100} radius="xs" />}
        </Flex>
        <Stack gap={0}>
          {Array.from({ length: NAV_TABS_SKELETON_COUNT }, (_, index) => (
            <Flex
              key={index}
              align="center"
              justify={isNavbarOpened ? "start" : "center"}
              gap="sm"
              p="sm"
            >
              <Skeleton h={16} w={16} radius="xs" flex="none" />
              {isNavbarOpened && (
                <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
              )}
            </Flex>
          ))}
        </Stack>
      </LoadingSkeleton>
      <Box h="100%" flex={1} miw={0} />
    </Flex>
  );
}
