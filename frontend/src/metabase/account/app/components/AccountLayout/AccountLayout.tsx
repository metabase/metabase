import type { ReactNode } from "react";
import type { Path } from "history";

import type { User } from "metabase-types/api";

import { AccountHeader } from "../AccountHeader";

import { AccountContent } from "./AccountLayout.styled";

interface AccountLayoutProps {
  user: User;
  path?: string;
  onChangeLocation?: (nextLocation: Path) => void;
  children?: ReactNode;
}

const AccountLayout = ({ children, ...props }: AccountLayoutProps) => {
  return (
    <div>
      <AccountHeader {...props} />
      <AccountContent>{children}</AccountContent>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AccountLayout;
