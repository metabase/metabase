import cx from "classnames";
import type { ReactNode } from "react";

import { Box, Flex, Group } from "metabase/ui";

import S from "./AreaLayout.module.css";
import { ToggleActionIcon } from "./ToggleActionIcon";

type AreaNavbarHeaderProps = {
  logo: ReactNode;
  headerControls?: ReactNode;
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

export function AreaNavbarHeader({
  logo,
  headerControls,
  isNavbarOpened,
  onNavbarToggle,
}: AreaNavbarHeaderProps) {
  return (
    <Flex
      className={S.header}
      align="center"
      justify={isNavbarOpened ? "space-between" : "center"}
      mt="xs"
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
