import type { LocationDescriptor } from "history";
import type { ReactNode } from "react";
import { push } from "react-router-redux";

import { AccountLayout } from "metabase/account/app/components/AccountLayout";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

export const AccountApp = ({
  location,
  children,
}: {
  location: Location;
  children: ReactNode;
}) => {
  const dispatch = useDispatch();

  const user = useSelector(getUser);
  const onChangeLocation = (location: LocationDescriptor) =>
    dispatch(push(location));

  if (!user) {
    return null;
  }

  return (
    <AccountLayout
      user={user}
      path={location.pathname}
      onChangeLocation={onChangeLocation}
    >
      {children}
    </AccountLayout>
  );
};
