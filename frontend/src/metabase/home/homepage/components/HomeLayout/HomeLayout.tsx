import React, { ReactNode } from "react";
import GreetingSection from "../../containers/HomeGreeting";
import { LayoutBody, LayoutRoot } from "./HomeLayout.styled";

export interface HomeLayoutProps {
  showIllustration?: boolean;
  children?: ReactNode;
}

const HomeLayout = ({
  showIllustration,
  children,
}: HomeLayoutProps): JSX.Element => {
  return (
    <LayoutRoot showIllustration={showIllustration}>
      <GreetingSection />
      <LayoutBody>{children}</LayoutBody>
    </LayoutRoot>
  );
};

export default HomeLayout;
