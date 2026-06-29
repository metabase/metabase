import { useHotkeys } from "@mantine/hooks";
import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import {
  ActionIcon,
  Box,
  Center,
  FixedSizeIcon,
  Flex,
  Group,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import { isMac } from "metabase/utils/browser";
import type { IconName } from "metabase-types/api";

import S from "./AreaLayout.module.css";

const TOOLTIP_OPEN_DELAY = 1000;

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
        <Stack gap="0.75rem" flex={1} mih={0} className={S.upperGroup}>
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

type AreaTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected?: boolean;
  showLabel: boolean;
  rightSection?: ReactNode;
  isGated?: boolean;
};

export function AreaTab({
  label,
  icon,
  to,
  isSelected,
  showLabel,
  rightSection,
  isGated,
}: AreaTabProps) {
  const upsellGem = isGated ? <UpsellGem.New size={14} /> : null;
  const effectiveRightSection = rightSection ?? upsellGem;

  return (
    <Tooltip
      label={label}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
      disabled={showLabel}
    >
      <Flex
        className={cx(S.tab, { [S.selected]: isSelected })}
        component={ForwardRefLink}
        to={to}
        p="sm"
        gap="sm"
        bdrs="md"
        aria-label={label}
        aria-current={isSelected ? "page" : undefined}
        justify={showLabel ? "start" : "center"}
      >
        <FixedSizeIcon name={icon} display="block" className={S.icon} />
        {showLabel && <Text lh="sm">{label}</Text>}
        {effectiveRightSection && (
          <Box
            className={showLabel ? undefined : S.badgeOverlay}
            ml={showLabel ? "auto" : undefined}
          >
            {effectiveRightSection}
          </Box>
        )}
      </Flex>
    </Tooltip>
  );
}

type AreaNavbarHeaderProps = {
  logo: ReactNode;
  headerControls?: ReactNode;
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

function AreaNavbarHeader({
  logo,
  headerControls,
  isNavbarOpened,
  onNavbarToggle,
}: AreaNavbarHeaderProps) {
  return (
    <Flex
      align="center"
      justify={isNavbarOpened ? "space-between" : "center"}
      mb="0.75rem"
      mt="sm"
    >
      <Group gap="sm">
        <Box
          className={cx(S.logoWrapper, { [S.navbarClosed]: !isNavbarOpened })}
        >
          <Box className={S.logo}>{logo}</Box>
          {!isNavbarOpened && (
            <ToggleActionIcon
              isNavbarOpened={isNavbarOpened}
              onNavbarToggle={onNavbarToggle}
            />
          )}
        </Box>
        {isNavbarOpened && headerControls}
      </Group>
      {isNavbarOpened && (
        <ToggleActionIcon isNavbarOpened onNavbarToggle={onNavbarToggle} />
      )}
    </Flex>
  );
}

const getSidebarTooltipLabel = (isNavbarOpened: boolean) => {
  const message = isNavbarOpened ? t`Close sidebar` : t`Open sidebar`;
  const modKey = isMac() ? "⌘" : "Ctrl";
  return `${message} ([ ${t`or`} ${modKey} + .)`;
};

type ToggleActionIconProps = {
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

function ToggleActionIcon({
  isNavbarOpened,
  onNavbarToggle,
}: ToggleActionIconProps) {
  const label = getSidebarTooltipLabel(isNavbarOpened);

  return (
    <Tooltip label={label} openDelay={TOOLTIP_OPEN_DELAY}>
      <ActionIcon
        aria-label={label}
        className={S.toggle}
        onClick={() => onNavbarToggle(!isNavbarOpened)}
      >
        <FixedSizeIcon
          name={isNavbarOpened ? "sidebar_closed" : "sidebar_open"}
          c="text-secondary"
        />
      </ActionIcon>
    </Tooltip>
  );
}
