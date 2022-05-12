import React, {
  forwardRef,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
  Ref,
} from "react";
import { TabIcon, TabLabel, TabRoot } from "./Tab.styled";

export interface TabProps extends HTMLAttributes<HTMLButtonElement> {
  icon?: string;
  isActive?: boolean;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

const Tab = forwardRef(function Tab(
  { icon, isActive, children, onClick, ...props }: TabProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <TabRoot {...props} ref={ref} isActive={isActive} onClick={onClick}>
      {icon && <TabIcon name={icon} />}
      <TabLabel>{children}</TabLabel>
    </TabRoot>
  );
});

export default Tab;
