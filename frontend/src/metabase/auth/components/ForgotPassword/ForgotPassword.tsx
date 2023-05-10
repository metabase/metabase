import React, { useCallback, useState } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import AuthLayout from "../../containers/AuthLayout";
import ForgotPasswordForm from "../ForgotPasswordForm";
import {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ForgotPassword;
