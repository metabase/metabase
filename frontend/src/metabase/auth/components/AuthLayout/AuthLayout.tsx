import type { ReactNode } from "react";

import LogoIcon from "metabase/components/LogoIcon";
import { useSelector } from "metabase/lib/redux";

import { getHasIllustration } from "../../selectors";

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
  const hasIllustration = useSelector(getHasIllustration);

  return (
    <LayoutRoot>
      {hasIllustration && <LayoutIllustration />}
      <LayoutBody>
        <LogoIcon height={65} />
        <LayoutCard>{children}</LayoutCard>
      </LayoutBody>
    </LayoutRoot>
  );
};
