import React, { useCallback, useEffect, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import AuthLayout from "../../containers/AuthLayout";
import ResetPasswordForm from "../ResetPasswordForm";
import { ResetPasswordData } from "../../types";
import { InfoBody, InfoMessage, InfoTitle } from "./ResetPassword.styled";

type ViewType = "none" | "form" | "success" | "expired";

export interface ResetPasswordProps {
  token: string;
  onResetPassword: (token: string, password: string) => void;
  onValidatePassword: (password: string) => Promise<string | undefined>;
  onValidatePasswordToken: (token: string) => void;
  onShowToast: (toast: { message: string }) => void;
  onRedirect: (url: string) => void;
}

const ResetPassword = ({
  token,
  onResetPassword,
  onValidatePassword,
  onValidatePasswordToken,
  onShowToast,
  onRedirect,
}: ResetPasswordProps): JSX.Element | null => {
  const [view, setView] = useState<ViewType>("none");

  const handleLoad = useCallback(async () => {
    try {
      await onValidatePasswordToken(token);
      setView("form");
    } catch (error) {
      setView("expired");
    }
  }, [token, onValidatePasswordToken]);

  const handlePasswordSubmit = useCallback(
    async ({ password }: ResetPasswordData) => {
      await onResetPassword(token, password);
      onRedirect("/");
      onShowToast({ message: t`You've updated your password.` });
    },
    [onResetPassword, token, onRedirect, onShowToast],
  );

  useEffect(() => {
    handleLoad();
  }, [handleLoad]);

  return (
    <AuthLayout>
      {view === "form" && (
        <ResetPasswordForm
          onValidatePassword={onValidatePassword}
          onSubmit={handlePasswordSubmit}
        />
      )}
      {view === "expired" && <ResetPasswordExpired />}
    </AuthLayout>
  );
};

const ResetPasswordExpired = (): JSX.Element => {
  return (
    <InfoBody>
      <InfoTitle>{t`Whoops, that's an expired link`}</InfoTitle>
      <InfoMessage>
        {t`For security reasons, password reset links expire after a little while. If you still need to reset your password, you can request a new reset email.`}
      </InfoMessage>
      <Button as={Link} primary to={"/auth/forgot_password"}>
        {t`Request a new reset email`}
      </Button>
    </InfoBody>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ResetPassword;
