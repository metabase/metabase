import React, {
  forwardRef,
  HTMLAttributes,
  ReactNode,
  Ref,
  useContext,
} from "react";
import TabContext from "../Tab/TabContext";

export interface TabPanelProps<T> extends HTMLAttributes<HTMLDivElement> {
  value?: T;
  children?: ReactNode;
}

const TabPanel = forwardRef(function TabPanel<T>(
  { value, children, ...props }: TabPanelProps<T>,
  ref: Ref<HTMLDivElement>,
) {
  const context = useContext(TabContext);
  const isSelected = value === context.value;

  return (
    <div
      {...props}
      ref={ref}
      role="tabpanel"
      hidden={!isSelected}
      aria-expanded={isSelected}
    >
      {isSelected && children}
    </div>
  );
});

export default TabPanel;
