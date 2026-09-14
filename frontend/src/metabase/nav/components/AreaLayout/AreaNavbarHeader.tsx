import cx from "classnames";
import type { ReactNode } from "react";

import { Box, Flex, Group, Text } from "metabase/ui";

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
        {isNavbarOpened && title && (
          <Text fw="bold" c="text-primary">
            {title}
          </Text>
        )}
        {isNavbarOpened && headerControls}
      </Group>
      {isNavbarOpened && (
        <ToggleActionIcon isNavbarOpened onNavbarToggle={onNavbarToggle} />
      )}
    </Flex>
  );
}
