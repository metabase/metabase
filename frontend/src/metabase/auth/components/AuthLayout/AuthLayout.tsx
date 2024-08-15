import type { ReactNode } from "react";

import LogoLoginIcon from "metabase/components/LogoLogin";
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
    <LayoutRoot>
      {loginPageIllustration && (
        <LayoutIllustration
          data-testid="login-page-illustration"
          backgroundImageSrc={loginPageIllustration.src}
          isDefault={loginPageIllustration.isDefault}
        />
      )}
      <LayoutBody>
        <LogoLoginIcon height={65} />
        <LayoutCard>{children}</LayoutCard>
      </LayoutBody>
    </LayoutRoot>
  );
};
