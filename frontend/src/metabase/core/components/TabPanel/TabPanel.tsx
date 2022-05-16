import React, {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
  useContext,
} from "react";
import { getTabId, getTabPanelId, TabContext } from "../Tab";

export interface TabPanelProps<T> extends HTMLAttributes<HTMLDivElement> {
  value?: T;
  children?: ReactNode;
}

const TabPanel = forwardRef(function TabPanel<T>(
  { value, children, ...props }: TabPanelProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  const { value: selectedValue, idPrefix } = useContext(TabContext);
  const tabId = getTabId(idPrefix, value);
  const panelId = getTabPanelId(idPrefix, value);
  const isSelected = value === selectedValue;

  return (
    <div
      {...props}
      ref={ref}
      id={panelId}
      role="tabpanel"
      hidden={!isSelected}
      aria-expanded={isSelected}
      aria-labelledby={tabId}
    >
      {isSelected && children}
    </div>
  );
});

export default TabPanel;
