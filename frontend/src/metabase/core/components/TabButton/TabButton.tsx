import React, {
  ButtonHTMLAttributes,
  MouseEvent,
  useContext,
  useCallback,
} from "react";

import { getTabId, getTabPanelId, TabContext } from "../Tab";
import { TabButtonLabel, TabButtonRoot } from "./TabButton.styled";

export interface TabButtonProps<T extends string | number>
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  value?: T;
}
function TabButton<T extends string | number>({
  value,
  children,
  onClick,
  ...props
}: TabButtonProps<T>) {
  const { value: selectedValue, idPrefix, onChange } = useContext(TabContext);
  const tabId = getTabId(idPrefix, value);
  const panelId = getTabPanelId(idPrefix, value);
  const isSelected = value === selectedValue;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      onChange?.(value);
    },
    [value, onClick, onChange],
  );

  return (
    <TabButtonRoot
      {...props}
      id={tabId}
      role="tab"
      isSelected={isSelected}
      aria-selected={isSelected}
      aria-controls={panelId}
      onClick={handleClick}
    >
      <TabButtonLabel>{children}</TabButtonLabel>
    </TabButtonRoot>
  );
}

export default Object.assign(TabButton, {
  Root: TabButtonRoot,
});
