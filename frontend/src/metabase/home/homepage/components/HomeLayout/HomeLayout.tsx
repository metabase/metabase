import React, { ReactNode } from "react";
import { Card } from "metabase-types/api";
import HomeGreeting from "../../containers/HomeGreeting";
import HomeMetabotWidget from "../../containers/HomeMetabotWidget/HomeMetabotWidget";
import {
  LayoutBody,
  LayoutIllustration,
  LayoutRoot,
} from "./HomeLayout.styled";

export interface HomeLayoutProps {
  showIllustration?: boolean;
  isMetabotEnabled?: boolean;
  models: [Card];
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
      {isMetabotEnabled && hasModels ? (
        <HomeMetabotWidget model={models[0]} />
      ) : (
        <HomeGreeting />
      )}
      <LayoutBody>{children}</LayoutBody>
    </LayoutRoot>
  );
};

export default HomeLayout;
