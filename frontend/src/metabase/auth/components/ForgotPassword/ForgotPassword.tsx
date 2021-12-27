import React, { useCallback, useState } from "react";
import { t } from "ttag";
import Link from "metabase/components/Link";
import Users from "metabase/entities/users";
import AuthLayout from "../AuthLayout/AuthLayout";
import { ForgotPasswordData, ForgotPasswordView } from "./types";
import {
  FormTitle,
  InfoBody,
  InfoIcon,
  InfoIconContainer,
  InfoMessage,
} from "./ForgotPassword.styled";

interface ForgotPasswordProps {
  showScene: boolean;
  canResetPassword: boolean;
  initialEmail?: string;
  onResetPassword: (email: string) => void;
}

const ForgotPassword = ({
  showScene,
  canResetPassword,
  initialEmail,
  onResetPassword,
}: ForgotPasswordProps): JSX.Element => {
  const [view, setView] = useState(
    canResetPassword ? ForgotPasswordView.form : ForgotPasswordView.disabled,
  );

  const handleSubmit = useCallback(
    async (data: ForgotPasswordData) => {
      await onResetPassword(data.email);
      setView(ForgotPasswordView.success);
    },
    [onResetPassword],
  );

  return (
    <AuthLayout showScene={showScene}>
      {view === ForgotPasswordView.form && (
        <ForgotPasswordForm
          initialEmail={initialEmail}
          onSubmit={handleSubmit}
        />
      )}
      {view === ForgotPasswordView.success && <ForgotPasswordSuccess />}
      {view === ForgotPasswordView.disabled && <ForgotPasswordDisabled />}
    </AuthLayout>
  );
};

interface ForgotPasswordFormProps {
  initialEmail?: string;
  onSubmit: (data: ForgotPasswordData) => void;
}

const ForgotPasswordForm = ({
  initialEmail,
  onSubmit,
}: ForgotPasswordFormProps): JSX.Element => {
  return (
    <div>
      <FormTitle>{t`Forgot password`}</FormTitle>
      <Users.Form
        form={Users.forms.password_forgot}
        submitTitle={t`Send password reset email`}
        initialValues={{ email: initialEmail }}
        onSubmit={onSubmit}
      />
    </div>
  );
};

const ForgotPasswordSuccess = (): JSX.Element => {
  return (
    <InfoBody>
      <InfoIconContainer>
        <InfoIcon name="check" />
      </InfoIconContainer>
      <InfoMessage>
        {t`Check your email for instructions on how to reset your password.`}
      </InfoMessage>
      <Link
        className="Button Button--primary"
        to={"/auth/login"}
      >{t`Back to sign in`}</Link>
    </InfoBody>
  );
};

const ForgotPasswordDisabled = (): JSX.Element => {
  return (
    <InfoBody>
      <InfoMessage>
        {t`Please contact an administrator to have them reset your password.`}
      </InfoMessage>
    </InfoBody>
  );
};

export default ForgotPassword;
