import type { ReactNode } from "react";
import type { Path } from "history";

import type { User } from "metabase-types/api";

import { AccountHeader } from "../AccountHeader";

import { AccountContent } from "./AccountLayout.styled";

interface AccountLayoutProps {
  user: User | null;
  path?: string;
  onChangeLocation?: (nextLocation: Path) => void;
  children?: ReactNode;
}

const AccountLayout = ({ children, user, ...props }: AccountLayoutProps) => {
  if (!user) {
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <div>
      <AccountHeader user={user} {...props} />
      <AccountContent>{children}</AccountContent>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AccountLayout;
