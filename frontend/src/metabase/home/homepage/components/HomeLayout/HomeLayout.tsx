import React, { ReactNode } from "react";
import GreetingSection from "../../containers/HomeGreeting";
import {
  LayoutContent,
  LayoutMain,
  LayoutRoot,
  LayoutScene,
  LayoutSceneImage,
} from "./HomeLayout.styled";

export interface HomeLayoutProps {
  showScene?: boolean;
  children?: ReactNode;
}

const HomeLayout = ({ showScene, children }: HomeLayoutProps): JSX.Element => {
  return (
    <LayoutRoot showScene={showScene}>
      {showScene && (
        <LayoutScene>
          <LayoutSceneImage
            src="app/img/bridge-light.png"
            srcSet="app/img/bridge-light.png 1x, app/img/bridge-light@2x.png 2x, app/img/bridge-light@3x.png 3x"
          />
        </LayoutScene>
      )}
      <LayoutMain>
        <GreetingSection />
        <LayoutContent>{children}</LayoutContent>
      </LayoutMain>
    </LayoutRoot>
  );
};

export default HomeLayout;
