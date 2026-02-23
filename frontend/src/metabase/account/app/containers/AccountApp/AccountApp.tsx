import type { Path } from "history";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { useSelector } from "metabase/lib/redux";
import { useNavigation } from "metabase/routing";
import { getUser } from "metabase/selectors/user";

import AccountLayout from "../../components/AccountLayout";

interface AccountAppProps {
  children?: ReactNode;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function AccountApp({ children }: AccountAppProps) {
  const user = useSelector(getUser);
  const location = useLocation();
  const { push } = useNavigation();

  return (
    <AccountLayout
      user={user}
      path={location.pathname}
      onChangeLocation={(nextLocation: Path) => push(nextLocation)}
    >
      {children}
    </AccountLayout>
  );
}
