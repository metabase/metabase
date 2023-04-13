import React, { useContext } from "react";
import { TabContext } from "../Tab/TabContext";
import { getTabButtonInputId } from "../Tab/utils";
import {
  TabButtonMenuAction,
  TabButtonMenuItem,
  TabButtonValue,
} from "./TabButton";
import { MenuContent, MenuItem } from "./TabButton.styled";

interface TabButtonMenuProps {
  menuItems: TabButtonMenuItem[];
  value?: TabButtonValue;
  closePopover: () => void;
}

export default function TabButtonMenu({
  menuItems,
  value,
  closePopover,
}: TabButtonMenuProps) {
  const context = useContext(TabContext);

  const clickHandler = (action: TabButtonMenuAction) => () => {
    action(context, value);
    closePopover();
  };

  return (
    <MenuContent
      role="listbox"
      aria-labelledby={getTabButtonInputId(context.idPrefix, value)}
      tabIndex={0}
    >
      {menuItems.map(({ label, action }) => (
        <MenuItem
          key={label}
          onClick={clickHandler(action)}
          role="option"
          tabIndex={0}
        >
          {label}
        </MenuItem>
      ))}
    </MenuContent>
  );
}
