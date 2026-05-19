import { useEffect } from "react";

import { useDispatch } from "metabase/redux";

import { logout } from "../../actions";

export const Logout = (): JSX.Element | null => {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(logout());
  }, [dispatch]);

  return null;
};
