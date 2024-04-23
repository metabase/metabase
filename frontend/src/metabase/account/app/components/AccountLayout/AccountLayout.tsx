import type { ReactNode } from "react";

import { AccountHeader } from "metabase/account/app/components/AccountHeader";
import { AccountContent } from "metabase/account/app/components/AccountLayout/AccountLayout.styled";
import type { AccountHeaderProps } from "metabase/account/app/components/types";

type AccountLayoutProps = {
  children: ReactNode;
} & AccountHeaderProps;

export const AccountLayout = ({ children, ...props }: AccountLayoutProps) => {
  return (
    <div>
      <AccountHeader {...props} />
      <AccountContent>{children}</AccountContent>
    </div>
  );
};
