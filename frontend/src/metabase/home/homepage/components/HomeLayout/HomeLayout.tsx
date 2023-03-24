import React, { ReactNode } from "react";
import HomeMetabotApp from "metabase/metabot/containers/HomeMetabotApp";
import { CollectionItem } from "metabase-types/api";
import HomeGreeting from "../../containers/HomeGreeting";
import {
  LayoutBody,
  LayoutIllustration,
  LayoutRoot,
} from "./HomeLayout.styled";

export interface HomeLayoutProps {
  models: CollectionItem[];
  showIllustration?: boolean;
  isMetabotEnabled?: boolean;
  children?: ReactNode;
}

const HomeLayout = ({
  models,
  showIllustration,
  isMetabotEnabled = true,
  children,
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
