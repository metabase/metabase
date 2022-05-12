import React, { ReactNode } from "react";
import { TabLabel, TabRoot } from "./Tab.styled";

export interface TabProps {
  icon?: string;
  isActive?: boolean;
  children?: ReactNode;
}

const Tab = ({ isActive, children }: TabProps): JSX.Element => {
  return (
    <TabRoot isActive={isActive}>
      <TabLabel>{children}</TabLabel>
    </TabRoot>
  );
};

export default Tab;
