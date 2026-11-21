import cx from "classnames";
import type { ReactNode } from "react";

import {
  SpaceSwitcherHeading,
  getSpaceHeading,
} from "metabase/nav/prototype/SpaceSwitcherHeading";
import { useNavVariant } from "metabase/nav/prototype/use-nav-variant";
import { Box, Flex, Group, Text } from "metabase/ui";

import { useGetCurrentApp } from "../AppSwitcher/useGetCurrentApp";

import S from "./AreaLayout.module.css";
import { ToggleActionIcon } from "./ToggleActionIcon";

type AreaNavbarHeaderProps = {
  logo: ReactNode;
  title?: ReactNode;
  headerControls?: ReactNode;
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

export function AreaNavbarHeader({
  logo,
  title,
  headerControls,
  isNavbarOpened,
  onNavbarToggle,
}: AreaNavbarHeaderProps) {
  // PROTOTYPE: in "No top nav", the space's name beside the logo opens the
  // space switcher, for areas with or without a title of their own.
  const { variant } = useNavVariant();
  const currentApp = useGetCurrentApp();
  const spaceHeading =
    typeof title === "string" ? title : getSpaceHeading(currentApp);

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
        {isNavbarOpened &&
          (variant === "no-top-nav" ? (
            <Box c="text-primary" miw={0}>
              <SpaceSwitcherHeading label={spaceHeading} />
            </Box>
          ) : (
            title && (
              <Text fw="bold" c="text-primary">
                {title}
              </Text>
            )
          ))}
        {isNavbarOpened && headerControls}
      </Group>
      {isNavbarOpened && (
        <ToggleActionIcon isNavbarOpened onNavbarToggle={onNavbarToggle} />
      )}
    </Flex>
  );
}
