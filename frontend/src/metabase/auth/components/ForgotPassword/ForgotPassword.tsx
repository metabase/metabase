import { useCallback, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useDispatch } from "metabase/redux";
import { forgotPassword } from "metabase/redux/auth";
import type { Location } from "metabase/router";
import { useSetting } from "metabase/settings";
import { Box, Button, Flex, Icon } from "metabase/ui";

import { AuthLayout } from "../AuthLayout";
import { ForgotPasswordForm } from "../ForgotPasswordForm";

import S from "./ForgotPassword.module.css";

type ViewType = "form" | "disabled" | "success";

interface ForgotPasswordProps {
  location?: Location;
}

export const ForgotPassword = ({
  location,
}: ForgotPasswordProps): JSX.Element => {
  const isEmailConfigured = useSetting("email-configured?");
  const isLdapEnabled = useSetting("ldap-enabled");
  const canResetPassword = isEmailConfigured && !isLdapEnabled;
  const initialEmail =
    new URLSearchParams(location?.search).get("email") ?? undefined;

  const [view, setView] = useState<ViewType>(
    canResetPassword ? "form" : "disabled",
  );
  const dispatch = useDispatch();

  const handleSubmit = useCallback(
    async (email: string) => {
      await dispatch(forgotPassword(email)).unwrap();
      setView("success");
    },
    [dispatch],
  );

  return (
    <AuthLayout>
      {view === "form" && (
        <ForgotPasswordForm
          initialEmail={initialEmail}
          onSubmit={handleSubmit}
        />
      )}
      {view === "success" && <ForgotPasswordSuccess />}
      {view === "disabled" && <ForgotPasswordDisabled />}
    </AuthLayout>
  );
};

const ForgotPasswordSuccess = (): JSX.Element => {
  return (
    <Flex direction="column" align="center">
      <Box className={S.infoIconContainer}>
        <Icon name="check" display="block" c="core-brand" size={24} />
      </Box>
      <Box c="text-primary" ta="center" mb="lg">
        {t` If the email exists, we'll send instructions on how to reset your password.`}
      </Box>
      <Button
        variant="filled"
        component="a"
        href="/auth/login"
      >{t`Back to sign in`}</Button>
    </Flex>
  );
};

const ForgotPasswordDisabled = (): JSX.Element => {
  return (
    <Flex direction="column" align="center">
      <Box c="text-primary" ta="center" mb="lg">
        {t`Please contact an administrator to have them reset your password.`}
      </Box>
      <Link className={S.infoLink} to="/auth/login">{t`Back to sign in`}</Link>
    </Flex>
  );
};
