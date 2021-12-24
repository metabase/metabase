import React, { ReactNode } from "react";
import LogoIcon from "metabase/components/LogoIcon";
import {
  LayoutBody,
  LayoutCard,
  LayoutRoot,
  LayoutScene,
  LayoutSceneImage,
} from "./AuthLayout.styled";

export interface AuthLayoutProps {
  showScene?: boolean;
  children?: ReactNode;
}

const AuthLayout = ({ showScene, children }: AuthLayoutProps): JSX.Element => {
  return (
    <LayoutRoot>
      {showScene && (
        <LayoutScene>
          <LayoutSceneImage
            src="/app/img/bridge.png"
            srcSet="/app/img/bridge.png 1x, /app/img/bridge@2x.png 2x, /app/img/bridge@3x.png 3x"
          />
        </LayoutScene>
      )}
      <LayoutBody>
        <LogoIcon height={65} />
        <LayoutCard>{children}</LayoutCard>
      </LayoutBody>
    </LayoutRoot>
  );
};

export default AuthLayout;
