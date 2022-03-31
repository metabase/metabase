import React, { ReactNode } from "react";
import { LayoutContent, LayoutMain, LayoutRoot } from "./HomeLayout.styled";

export interface HomeLayoutProps {
  showScene?: boolean;
  children?: ReactNode;
}

const HomeLayout = ({ showScene, children }: HomeLayoutProps): JSX.Element => {
  return (
    <LayoutRoot showScene={showScene}>
      <LayoutMain>
        <LayoutContent>{children}</LayoutContent>
      </LayoutMain>
    </LayoutRoot>
  );
};

export default HomeLayout;
