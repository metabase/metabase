import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import Users from "metabase/entities/users";
import Link from "metabase/components/Link";
import AuthLayout from "../AuthLayout/AuthLayout";
import {
  ExpiredBody,
  ExpiredMessage,
  ExpiredTitle,
  FormMessage,
  FormTitle,
  SuccessBody,
  SuccessIcon,
  SuccessIconContainer,
  SuccessMessage,
  SuccessTitle,
} from "./ResetPassword.styled";

export interface ResetPasswordProps {
  token: string;
  showScene: boolean;
  onResetPassword: (token: string, password: string) => void;
  onValidateToken: (token: string) => void;
}

const ResetPassword = ({
  token,
  showScene,
  onResetPassword,
  onValidateToken,
}: ResetPasswordProps): JSX.Element | null => {
  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleLoad = useCallback(async () => {
    try {
      await onValidateToken(token);
      setIsValid(true);
    } finally {
      setIsLoading(false);
    }
  }, [token, onValidateToken]);

  const handleSubmit = useCallback(
    async ({ password }: PasswordInfo) => {
      await onResetPassword(token, password);
      setIsSubmitted(true);
    },
    [token, onResetPassword],
  );

  useEffect(() => {
    handleLoad();
  }, [handleLoad]);

  if (isLoading) {
    return null;
  }

  return (
    <AuthLayout showScene={showScene}>
      {!isValid && <ResetPasswordExpired />}
      {isValid && !isSubmitted && <ResetPasswordForm onSubmit={handleSubmit} />}
      {isValid && isSubmitted && <ResetPasswordSuccess />}
    </AuthLayout>
  );
};

export interface PasswordInfo {
  password: string;
}

interface ResetPasswordFormProps {
  onSubmit: (info: PasswordInfo) => void;
}

const ResetPasswordForm = ({
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
        submitTitle={t`Save new password`}
        onSubmit={onSubmit}
      />
    </div>
  );
};

const ResetPasswordSuccess = (): JSX.Element => {
  return (
    <SuccessBody>
      <SuccessIconContainer>
        <SuccessIcon name="check" />
      </SuccessIconContainer>
      <SuccessTitle>{t`All done!`}</SuccessTitle>
      <SuccessMessage>{t`Awesome, you've successfully updated your password.`}</SuccessMessage>
      <Link
        className="Button Button--primary"
        to={"/"}
      >{t`Sign in with your new password`}</Link>
    </SuccessBody>
  );
};

const ResetPasswordExpired = (): JSX.Element => {
  return (
    <ExpiredBody>
      <ExpiredTitle>{t`Whoops, that's an expired link`}</ExpiredTitle>
      <ExpiredMessage>
        {t`For security reasons, password reset links expire after a little while. If you still need to reset your password, you can request a new reset email.`}
      </ExpiredMessage>
      <Link
        className="Button Button--primary"
        to={"/auth/forgot_password"}
      >{t`Request a new reset email`}</Link>
    </ExpiredBody>
  );
};

export default ResetPassword;
