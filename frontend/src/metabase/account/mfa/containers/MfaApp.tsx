import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import { getUser } from "metabase/selectors/user";

import { MfaSetup } from "../components/MfaSetup";

const MfaApp = (): JSX.Element | null => {
  const user = useSelector(getUser);
  const dispatch = useDispatch();

  const handleStatusChange = useCallback(() => {
    dispatch(refreshCurrentUser());
  }, [dispatch]);

  if (!user) {
    return null;
  }

  return (
    <MfaSetup
      totpEnabled={user.totp_enabled}
      onStatusChange={handleStatusChange}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- routes require default export
export default MfaApp;
