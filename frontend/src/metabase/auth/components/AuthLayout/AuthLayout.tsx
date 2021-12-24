import React, { ReactNode } from "react";
import { LayoutBody, LayoutCard, LayoutRoot } from "./AuthLayout.styled";
import LogoIcon from "metabase/components/LogoIcon";
import AuthScene from "../../containers/AuthScene";

export interface AuthLayoutProps {
  children?: ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps): JSX.Element => {
  return (
    <LayoutRoot>
      <AuthScene />
      <LayoutBody>
        <LogoIcon height={65} />
        <LayoutCard>{children}</LayoutCard>
      </LayoutBody>
    </LayoutRoot>
  );
};

export default AuthLayout;
