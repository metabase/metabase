import React, { ReactNode } from "react";
import MetabotWidget from "metabase/metabot/containers/MetabotWidget";
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
      {isMetabotEnabled && hasModels ? <MetabotWidget /> : <HomeGreeting />}
      <LayoutBody>{children}</LayoutBody>
    </LayoutRoot>
  );
};

export default HomeLayout;
