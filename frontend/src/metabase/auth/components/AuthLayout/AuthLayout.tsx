import React, { ReactNode } from "react";
import LogoIcon from "metabase/components/LogoIcon";
import {
  LayoutBody,
  LayoutCard,
  LayoutIllustration,
  LayoutRoot,
} from "./AuthLayout.styled";

export interface AuthLayoutProps {
  showIllustration: boolean;
  children?: ReactNode;
}

const AuthLayout = ({
  showIllustration,
  children,
}: AuthLayoutProps): JSX.Element => {
  return (
    <LayoutRoot>
      {showIllustration && <LayoutIllustration />}
      <LayoutBody>
        <LogoIcon height={65} />
        <LayoutCard>{children}</LayoutCard>
      </LayoutBody>
    </LayoutRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AuthLayout;
