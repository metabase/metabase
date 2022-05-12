import React, { forwardRef, HTMLAttributes, ReactNode, Ref } from "react";
import { TabIcon, TabLabel, TabRoot } from "./Tab.styled";

export interface TabProps extends HTMLAttributes<HTMLButtonElement> {
  icon?: string;
  isActive?: boolean;
  children?: ReactNode;
}

const Tab = forwardRef(function Tab(
  { icon, isActive, children, ...props }: TabProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <TabRoot {...props} ref={ref} isActive={isActive}>
      {icon && <TabIcon name={icon} />}
      <TabLabel>{children}</TabLabel>
    </TabRoot>
  );
});

export default Tab;
