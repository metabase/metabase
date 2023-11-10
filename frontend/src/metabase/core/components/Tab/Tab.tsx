import type { HTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { forwardRef, useContext, useCallback } from "react";
import type { IconName } from "../Icon";
import { TabContext } from "./TabContext";
import { TabIcon, TabLabel, TabRoot, TabSortIcon } from "./Tab.styled";
import { getTabId, getTabPanelId } from "./utils";

export interface TabProps<T> extends HTMLAttributes<HTMLButtonElement> {
  value?: T;
  icon?: IconName;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  sortIconState: string;
  setSortIconState: (value: string) => void;
}

const Tab = forwardRef(function Tab<T>(
  { value, icon, children, onClick, setSortIconState, ...props }: TabProps<T>,
  ref: Ref<HTMLButtonElement>,
) {
  const { value: selectedValue, idPrefix, onChange } = useContext(TabContext);
  const tabId = getTabId(idPrefix, value);
  const panelId = getTabPanelId(idPrefix, value);
  const isSelected = value === selectedValue;

  const toggleSortIconState = useCallback(() => {
    if (isSelected) {
      if (props.sortIconState === "default") {
        setSortIconState("ascending");
      } else if (props.sortIconState === "ascending") {
        setSortIconState("descending");
      } else if (props.sortIconState === "descending") {
        setSortIconState("default");
      } else {
        setSortIconState("default");
      }
    }
  }, [props.sortIconState, isSelected, setSortIconState]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      onChange?.(value);
      toggleSortIconState();
    },
    [value, onClick, onChange, toggleSortIconState],
  );

  const sortIconDirection = () => {
    if (props.sortIconState === "ascending") {
      return "↑";
    } else if (props.sortIconState === "descending") {
      return "↓";
    } else {
      return "↑↓";
    }
  };

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
      <TabSortIcon>{isSelected ? sortIconDirection() : ""}</TabSortIcon>
    </TabRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Tab;
