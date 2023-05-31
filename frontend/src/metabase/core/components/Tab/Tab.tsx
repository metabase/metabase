import React, {
  forwardRef,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
  Ref,
  useCallback,
  useContext,
} from "react";
import { IconName } from "../Icon";
import { TabContext } from "./TabContext";
import { TabIcon, TabLabel, TabRoot } from "./Tab.styled";
import { getTabId, getTabPanelId } from "./utils";

export interface TabProps<T> extends HTMLAttributes<HTMLButtonElement> {
  value?: T;
  icon?: IconName;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

const Tab = forwardRef(function Tab<T>(
  { value, icon, children, onClick, ...props }: TabProps<T>,
  ref: Ref<HTMLButtonElement>,
) {
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
    <TabRoot
      {...props}
      ref={ref}
      id={tabId}
      role="tab"
      isSelected={isSelected}
      aria-selected={isSelected}
      aria-controls={panelId}
      onClick={handleClick}
    >
      {icon && <TabIcon name={icon} />}
      <TabLabel>{children}</TabLabel>
    </TabRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Tab;
