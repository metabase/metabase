import React, { ReactNode } from "react";
import HomeMetabotApp from "metabase/metabot/containers/HomeMetabotApp";
import { Card } from "metabase-types/api";
import HomeGreeting from "../../containers/HomeGreeting";
import {
  LayoutBody,
  LayoutIllustration,
  LayoutRoot,
} from "./HomeLayout.styled";

export interface HomeLayoutProps {
  showIllustration?: boolean;
  isMetabotEnabled?: boolean;
  models: Card[];
  children?: ReactNode;
}

const HomeLayout = ({
  showIllustration,
  children,
  isMetabotEnabled = true,
  models,
}: HomeLayoutProps): JSX.Element => {
  const hasModels = models.length > 0;
  return (
    <LayoutRoot>
      {showIllustration && <LayoutIllustration />}
      {isMetabotEnabled && hasModels ? <HomeMetabotApp /> : <HomeGreeting />}
      <LayoutBody>{children}</LayoutBody>
    </LayoutRoot>
  );
};

export default HomeLayout;
