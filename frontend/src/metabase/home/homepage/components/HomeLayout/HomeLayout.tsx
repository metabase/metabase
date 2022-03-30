import React, { ReactNode } from "react";
import { LayoutRoot, LayoutBody } from "./HomeLayout.styled";

export interface HomeLayoutProps {
  children?: ReactNode;
}

const HomeLayout = ({ children }: HomeLayoutProps): JSX.Element => {
  return (
    <LayoutRoot>
      <LayoutBody>{children}</LayoutBody>
    </LayoutRoot>
  );
};

export default HomeLayout;
