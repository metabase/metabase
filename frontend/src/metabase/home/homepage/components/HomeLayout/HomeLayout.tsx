import React, { ReactNode } from "react";
import MetabotWidget from "metabase/metabot/components/MetabotWidget";
import HomeGreeting from "../../containers/HomeGreeting";
import {
  LayoutBody,
  LayoutIllustration,
  LayoutRoot,
} from "./HomeLayout.styled";

export interface HomeLayoutProps {
  hasMetabot?: boolean;
  hasIllustration?: boolean;
  children?: ReactNode;
}

const HomeLayout = ({
  hasMetabot,
  hasIllustration,
  children,
}: HomeLayoutProps): JSX.Element => {
  return (
    <LayoutRoot>
      {hasIllustration && <LayoutIllustration />}
      {hasMetabot ? <MetabotWidget /> : <HomeGreeting />}
      <LayoutBody>{children}</LayoutBody>
    </LayoutRoot>
  );
};

export default HomeLayout;
