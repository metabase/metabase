import { useContext } from "react";

import { TabContext } from "../Tab/TabContext";
import { getTabButtonInputId } from "../Tab/utils";
import { TabButtonMenuAction, TabButtonMenuItem } from "./TabButton";
import { MenuContent, MenuItem } from "./TabButton.styled";

interface TabButtonMenuProps<T> {
  menuItems: TabButtonMenuItem<T>[];
  value: T;
  closePopover: () => void;
}

export function TabButtonMenu<T>({
  menuItems,
  value,
  closePopover,
}: TabButtonMenuProps<T>) {
  const context = useContext(TabContext);

  const clickHandler = (action: TabButtonMenuAction<T>) => () => {
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
