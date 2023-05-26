import React, { ReactNode } from "react";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import LogoIcon from "metabase/components/LogoIcon";
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
  const showIllustration = useSelector(state =>
    getSetting(state, "show-lighthouse-illustration"),
  );

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
