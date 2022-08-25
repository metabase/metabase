import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { getIn } from "icepick";
import Settings from "metabase/lib/settings";
import Users from "metabase/entities/users";
import Link from "metabase/core/components/Link";
import AuthLayout from "../../containers/AuthLayout";
import { ResetPasswordData } from "../../types";
import {
  FormMessage,
  FormTitle,
  InfoBody,
  InfoMessage,
  InfoTitle,
} from "./ResetPassword.styled";

type ViewType = "none" | "form" | "success" | "expired";

export interface ResetPasswordProps {
  token: string;
  onResetPassword: (token: string, password: string) => void;
  onValidatePassword: (password: string) => void;
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

  const handlePasswordChange = useCallback(
    async ({ password }: ResetPasswordData) => {
      try {
        await onValidatePassword(password);
        return {};
      } catch (error) {
        return getPasswordError(error);
      }
    },
    [onValidatePassword],
  );

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
          onPasswordChange={handlePasswordChange}
          onSubmit={handlePasswordSubmit}
        />
      )}
      {view === "expired" && <ResetPasswordExpired />}
    </AuthLayout>
  );
};

interface ResetPasswordFormProps {
  onPasswordChange: (data: ResetPasswordData) => void;
  onSubmit: (data: ResetPasswordData) => void;
}

const ResetPasswordForm = ({
  onPasswordChange,
  onSubmit,
}: ResetPasswordFormProps): JSX.Element => {
  const passwordDescription = useMemo(
    () => Settings.passwordComplexityDescription(),
    [],
  );

  return (
    <div>
      <FormTitle>{t`New password`}</FormTitle>
      <FormMessage>{t`To keep your data secure, passwords ${passwordDescription}`}</FormMessage>
      <Users.Form
        form={Users.forms.password_reset}
        asyncValidate={onPasswordChange}
        asyncBlurFields={["password"]}
        submitTitle={t`Save new password`}
        submitFullWidth
        onSubmit={onSubmit}
      />
    </div>
  );
};

const ResetPasswordExpired = (): JSX.Element => {
  return (
    <InfoBody>
      <InfoTitle>{t`Whoops, that's an expired link`}</InfoTitle>
      <InfoMessage>
        {t`For security reasons, password reset links expire after a little while. If you still need to reset your password, you can request a new reset email.`}
      </InfoMessage>
      <Link
        className="Button Button--primary"
        to={"/auth/forgot_password"}
      >{t`Request a new reset email`}</Link>
    </InfoBody>
  );
};

const getPasswordError = (error: unknown) => {
  return getIn(error, ["data", "errors"]);
};

export default ResetPassword;
