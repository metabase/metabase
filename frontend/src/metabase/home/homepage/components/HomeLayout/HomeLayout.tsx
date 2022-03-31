import React, { ReactNode } from "react";
import GreetingSection from "../../containers/HomeGreeting";
import { LayoutContent, LayoutMain, LayoutRoot } from "./HomeLayout.styled";

export interface HomeLayoutProps {
  showScene?: boolean;
  children?: ReactNode;
}

const HomeLayout = ({ showScene, children }: HomeLayoutProps): JSX.Element => {
  return (
    <LayoutRoot showScene={showScene}>
      <LayoutMain>
        <GreetingSection />
        <LayoutContent>{children}</LayoutContent>
      </LayoutMain>
    </LayoutRoot>
  );
};

export default HomeLayout;
