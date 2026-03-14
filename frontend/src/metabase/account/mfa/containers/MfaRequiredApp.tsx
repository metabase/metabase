import { useCallback, useEffect } from "react";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { getUser } from "metabase/selectors/user";
import { Alert, Box, Stack } from "metabase/ui";

import { MfaSetup } from "../components/MfaSetup";

const MfaRequiredApp = (): JSX.Element | null => {
  const user = useSelector(getUser);
  const dispatch = useDispatch();

  const handleStatusChange = useCallback(async () => {
    await dispatch(refreshCurrentUser());
    // Best-effort — don't block navigation if settings refresh fails
    dispatch(refreshSiteSettings());
    dispatch(push("/"));
  }, [dispatch]);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!user) {
      dispatch(replace("/auth/login"));
    }
  }, [user, dispatch]);

  // Redirect home if MFA is already enabled
  useEffect(() => {
    if (user?.totp_enabled) {
      dispatch(replace("/"));
    }
  }, [user?.totp_enabled, dispatch]);

  if (!user || user.totp_enabled) {
    return null;
  }

  return (
    <Box maw={600} mx="auto" mt="xl" p="xl">
      <Stack gap="lg">
        <Alert
          color="warning"
          title={t`Two-factor authentication required`}
        >{t`Your administrator requires two-factor authentication for your account. Please set it up to continue.`}</Alert>
        <MfaSetup
          totpEnabled={user.totp_enabled}
          onStatusChange={handleStatusChange}
          required
        />
      </Stack>
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- routes require default export
export default MfaRequiredApp;
