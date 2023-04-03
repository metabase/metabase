import React, {
  ButtonHTMLAttributes,
  MouseEvent,
  useContext,
  useCallback,
  useRef,
  useState,
} from "react";

import ControlledPopoverWithTrigger from "metabase/components/PopoverWithTrigger/ControlledPopoverWithTrigger";

import {
  getTabButtonLabelId,
  getTabId,
  getTabPanelId,
  TabContext,
  TabContextType,
} from "../Tab";
import { TabButtonLabel, TabButtonRoot, MenuButton } from "./TabButton.styled";
import TabButtonMenu from "./TabButtonMenu";

export type TabButtonValue = string | number;

export type TabButtonMenuAction = (
  context: TabContextType,
  value?: TabButtonValue,
) => void;

export interface TabButtonMenuItem {
  label: string;
  action: TabButtonMenuAction;
}

export interface TabButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  value?: TabButtonValue;
  menuItems?: TabButtonMenuItem[];
}

function TabButton({
  value,
  menuItems,
  children,
  onClick,
  ...props
}: TabButtonProps) {
  const { value: selectedValue, idPrefix, onChange } = useContext(TabContext);
  const isSelected = value === selectedValue;

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const showMenu = menuItems !== undefined && menuItems.length > 0;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (menuButtonRef.current?.contains(event.target as Node)) {
        return;
      }
      onClick?.(event);
      onChange?.(value);
    },
    [value, onClick, onChange],
  );

  return (
    <TabButtonRoot
      {...props}
      id={getTabId(idPrefix, value)}
      role="tab"
      isSelected={isSelected}
      aria-selected={isSelected}
      aria-controls={getTabPanelId(idPrefix, value)}
      onClick={handleClick}
    >
      <TabButtonLabel id={getTabButtonLabelId(idPrefix, value)}>
        {children}
      </TabButtonLabel>
      {showMenu && (
        <ControlledPopoverWithTrigger
          visible={isMenuOpen}
          onOpen={() => setIsMenuOpen(true)}
          onClose={() => setIsMenuOpen(false)}
          renderTrigger={({ onClick }) => (
            <MenuButton
              icon="chevrondown"
              iconSize={10}
              isSelected={isSelected}
              isOpen={isMenuOpen}
              onClick={onClick}
              ref={menuButtonRef}
              disabled={props.disabled}
            />
          )}
          popoverContent={({ closePopover }) => (
            <TabButtonMenu
              menuItems={menuItems}
              value={value}
              closePopover={closePopover}
            />
          )}
        />
      )}
    </TabButtonRoot>
  );
}

export default Object.assign(TabButton, {
  Root: TabButtonRoot,
});
