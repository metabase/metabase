import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import Users from "metabase/entities/users";
import Button from "metabase/core/components/Button";
import AuthLayout from "../../containers/AuthLayout";
import { ForgotPasswordData } from "../../types";
import {
  FormFooter,
  FormLink,
  FormTitle,
  InfoBody,
  InfoIcon,
  InfoIconContainer,
  InfoLink,
  InfoMessage,
} from "./ForgotPassword.styled";

type ViewType = "form" | "disabled" | "success";

export interface ForgotPasswordProps {
  canResetPassword: boolean;
  initialEmail?: string;
  onResetPassword: (email: string) => void;
}

const ForgotPassword = ({
  canResetPassword,
  initialEmail,
  onResetPassword,
}: ForgotPasswordProps): JSX.Element => {
  const [view, setView] = useState<ViewType>(
    canResetPassword ? "form" : "disabled",
  );

  const handleSubmit = useCallback(
    async (email: string) => {
      await onResetPassword(email);
      setView("success");
    },
    [onResetPassword],
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

interface ForgotPasswordFormProps {
  initialEmail?: string;
  onSubmit: (email: string) => void;
}

const ForgotPasswordForm = ({
  initialEmail,
  onSubmit,
}: ForgotPasswordFormProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return { email: initialEmail };
  }, [initialEmail]);

  const handleSubmit = useCallback(
    async ({ email }: ForgotPasswordData) => {
      await onSubmit(email);
    },
    [onSubmit],
  );

  return (
    <div>
      <FormTitle>{t`Forgot password`}</FormTitle>
      <Users.Form
        form={Users.forms.password_forgot}
        initialValues={initialValues}
        submitTitle={t`Send password reset email`}
        submitFullWidth
        onSubmit={handleSubmit}
      />
      <FormFooter>
        <FormLink to="/auth/login">{t`Back to sign in`}</FormLink>
      </FormFooter>
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
      <Button primary as="a" href="/auth/login">{t`Back to sign in`}</Button>
    </InfoBody>
  );
};

const ForgotPasswordDisabled = (): JSX.Element => {
  return (
    <InfoBody>
      <InfoMessage>
        {t`Please contact an administrator to have them reset your password.`}
      </InfoMessage>
      <InfoLink to="/auth/login">{t`Back to sign in`}</InfoLink>
    </InfoBody>
  );
};

export default ForgotPassword;
