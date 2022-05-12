import React, { ReactNode } from "react";
import { TabIcon, TabLabel, TabRoot } from "./Tab.styled";

export interface TabProps {
  icon?: string;
  isActive?: boolean;
  children?: ReactNode;
}

const Tab = ({ icon, isActive, children }: TabProps): JSX.Element => {
  return (
    <TabRoot isActive={isActive}>
      {icon && <TabIcon name={icon} />}
      <TabLabel>{children}</TabLabel>
    </TabRoot>
  );
};

export default Tab;
