import type { ReactNode } from "react";

import { Box, Menu } from "metabase/ui";

import { AnchorTarget, type GetAnchorRect } from "../AnchorTarget/AnchorTarget";

import S from "./SuggestionMenu.module.css";

type SuggestionMenuProps = {
  getAnchorRect: GetAnchorRect;
  footer?: ReactNode;
  children: ReactNode;
};

export const SuggestionMenu = ({
  getAnchorRect,
  footer,
  children,
}: SuggestionMenuProps) => (
  <Menu
    opened
    position="bottom-start"
    offset={4}
    trapFocus={false}
    returnFocus={false}
    closeOnItemClick={false}
    closeOnEscape={false}
  >
    <Menu.Target>
      <AnchorTarget getRect={getAnchorRect} />
    </Menu.Target>
    <Menu.Dropdown
      className={S.dropdown}
      w="20rem"
      mah="25rem"
      p={0}
      onMouseDown={(event) => event.preventDefault()}
    >
      <Box className={S.items} p="sm">
        {children}
      </Box>
      {footer && <Box className={S.footer}>{footer}</Box>}
    </Menu.Dropdown>
  </Menu>
);
