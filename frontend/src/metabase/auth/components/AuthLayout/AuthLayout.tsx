import type { ReactNode } from "react";

import LogoIcon from "metabase/common/components/LogoIcon";
import { useSelector } from "metabase/lib/redux";
import { getLoginPageIllustration } from "metabase/selectors/whitelabel";

import {
  LayoutBody,
  LayoutCard,
  LayoutIllustration,
  LayoutRoot,
} from "./AuthLayout.styled";

interface AuthLayoutProps {
  children?: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps): JSX.Element => {
  const loginPageIllustration = useSelector(getLoginPageIllustration);

  return (
    <LayoutRoot data-testid="login-page">
      {loginPageIllustration && (
        <LayoutIllustration
          data-testid="login-page-illustration"
          backgroundImageSrc={loginPageIllustration.src}
          isDefault={loginPageIllustration.isDefault}
        />
      )}
      <LayoutBody>
        <LogoIcon height={65} />
        <LayoutCard>{children}</LayoutCard>
      </LayoutBody>
    </LayoutRoot>
  );
};
