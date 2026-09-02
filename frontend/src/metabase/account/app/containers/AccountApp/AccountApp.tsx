import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useLocation, useNavigate } from "metabase/router";

import AccountLayout from "../../components/AccountLayout";

export function AccountApp() {
  const navigate = useNavigate();
  const user = useSelector(getUser);
  const { pathname } = useLocation();

  return (
    <AccountLayout
      user={user}
      path={pathname}
      onChangeLocation={(nextLocation) => navigate(nextLocation)}
    />
  );
}
