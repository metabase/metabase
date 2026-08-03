import { useDispatch, useSelector } from "metabase/redux";
import { push, useLocation } from "metabase/router";
import { getUser } from "metabase/selectors/user";

import AccountLayout from "../../components/AccountLayout";

export function AccountApp() {
  const dispatch = useDispatch();
  const user = useSelector(getUser);
  const { pathname } = useLocation();

  return (
    <AccountLayout
      user={user}
      path={pathname}
      onChangeLocation={(nextLocation) => dispatch(push(nextLocation))}
    />
  );
}
