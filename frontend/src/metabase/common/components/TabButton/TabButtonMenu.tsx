import type { UniqueIdentifier } from "@dnd-kit/core";
import cx from "classnames";
import type { MouseEvent } from "react";
import { useContext } from "react";

import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";

import { TabContext } from "../Tab/TabContext";
import { getTabButtonInputId } from "../Tab/utils";

import type { TabButtonMenuAction, TabButtonMenuItem } from "./TabButton";
import S from "./TabButton.module.css";

interface TabButtonMenuProps {
  menuItems: TabButtonMenuItem[];
  value: UniqueIdentifier | null;
  closePopover: () => void;
}

export function TabButtonMenu({
  menuItems,
  value,
  closePopover,
}: TabButtonMenuProps) {
  const context = useContext(TabContext);

  const clickHandler = (action: TabButtonMenuAction) => (event: MouseEvent) => {
    event.stopPropagation();
    action(context, value);
    closePopover();
  };

  return (
    <Box
      component="ul"
      p="sm"
      role="listbox"
      aria-labelledby={getTabButtonInputId(context.idPrefix, value)}
      tabIndex={0}
    >
      {menuItems.map(({ label, action }) => (
        <Box
          component="li"
          className={cx(S.menuItem, CS.cursorPointer)}
          key={label}
          w="100%"
          py="0.85em"
          px="1.45em"
          bdrs="0.5em"
          fw={700}
          ta="start"
          td="none"
          onClick={clickHandler(action)}
          role="option"
          tabIndex={0}
        >
          {label}
        </Box>
      ))}
    </Box>
  );
}
