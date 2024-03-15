import type { ReactNode } from "react";

import LogoIcon from "metabase/components/LogoIcon";
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
          src={loginPageIllustration}
          isDefault={loginPageIllustration === "app/img/bridge.svg"}
        />
      )}
      <LayoutBody>
        <LogoIcon height={65} />
        <LayoutCard>{children}</LayoutCard>
      </LayoutBody>
    </LayoutRoot>
  );
};
