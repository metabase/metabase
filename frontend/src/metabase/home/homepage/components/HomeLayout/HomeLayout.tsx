import React, { ReactNode } from "react";
import { LayoutBody, LayoutRoot } from "./HomeLayout.styled";

export interface HomeLayoutProps {
  showScene?: boolean;
  children?: ReactNode;
}

const HomeLayout = ({ showScene, children }: HomeLayoutProps): JSX.Element => {
  return (
    <LayoutRoot showScene={showScene}>
      <LayoutBody>{children}</LayoutBody>
    </LayoutRoot>
  );
};

export default HomeLayout;
