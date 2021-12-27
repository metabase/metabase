import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { getIn } from "icepick";
import Settings from "metabase/lib/settings";
import Users from "metabase/entities/users";
import Link from "metabase/components/Link";
import AuthLayout from "../AuthLayout/AuthLayout";
import { PasswordData, ViewType } from "./types";
import {
  FormMessage,
  FormTitle,
  InfoBody,
  InfoIcon,
  InfoIconContainer,
  InfoMessage,
  InfoTitle,
} from "./ResetPassword.styled";

export interface ResetPasswordProps {
  token: string;
  showScene: boolean;
  onResetPassword: (token: string, password: string) => void;
  onValidatePassword: (password: string) => void;
  onValidatePasswordToken: (token: string) => void;
}

const ResetPassword = ({
  token,
  showScene,
  onResetPassword,
  onValidatePassword,
  onValidatePasswordToken,
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
    async ({ password }: PasswordData) => {
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
    async ({ password }: PasswordData) => {
      await onResetPassword(token, password);
      setView("success");
    },
    [token, onResetPassword],
  );

  useEffect(() => {
    handleLoad();
  }, [handleLoad]);

  return (
    <AuthLayout showScene={showScene}>
      {view === "form" && (
        <ResetPasswordForm
          onPasswordChange={handlePasswordChange}
          onSubmit={handlePasswordSubmit}
        />
      )}
      {view === "success" && <ResetPasswordSuccess />}
      {view === "expired" && <ResetPasswordExpired />}
    </AuthLayout>
  );
};

interface ResetPasswordFormProps {
  onPasswordChange: (data: PasswordData) => void;
  onSubmit: (data: PasswordData) => void;
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

const ResetPasswordSuccess = (): JSX.Element => {
  return (
    <InfoBody>
      <InfoIconContainer>
        <InfoIcon name="check" />
      </InfoIconContainer>
      <InfoTitle>{t`All done!`}</InfoTitle>
      <InfoMessage>{t`Awesome, you've successfully updated your password.`}</InfoMessage>
      <Link
        className="Button Button--primary"
        to={"/"}
      >{t`Sign in with your new password`}</Link>
    </InfoBody>
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
