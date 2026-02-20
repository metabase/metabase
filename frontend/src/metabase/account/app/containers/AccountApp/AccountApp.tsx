import type { Path } from "history";
import type { ReactNode } from "react";

import { useSelector } from "metabase/lib/redux";
import { useLocationWithQuery, useNavigation } from "metabase/routing/compat";
import { getUser } from "metabase/selectors/user";

import AccountLayout from "../../components/AccountLayout";

interface AccountAppProps {
  children?: ReactNode;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function AccountApp({ children }: AccountAppProps) {
  const user = useSelector(getUser);
  const location = useLocationWithQuery();
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
