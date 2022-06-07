import React, { ReactNode } from "react";
import LogoIcon from "metabase/components/LogoIcon";
import { LayoutBody, LayoutCard, LayoutRoot } from "./AuthLayout.styled";

export interface AuthLayoutProps {
  showScene: boolean;
  children?: ReactNode;
}

const AuthLayout = ({ showScene, children }: AuthLayoutProps): JSX.Element => {
  return (
    <LayoutRoot showScene={showScene}>
      <LayoutBody>
        <LogoIcon height={65} />
        <LayoutCard>{children}</LayoutCard>
      </LayoutBody>
    </LayoutRoot>
  );
};

export default AuthLayout;
