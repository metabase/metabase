import type { Location } from "history";
import { useCallback, useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import { useDispatch, useSelector } from "metabase/lib/redux";

import { forgotPassword } from "../../actions";
import { getIsEmailConfigured, getIsLdapEnabled } from "../../selectors";
import { AuthLayout } from "../AuthLayout";
import { ForgotPasswordForm } from "../ForgotPasswordForm";

import {
  InfoBody,
  InfoIcon,
  InfoIconContainer,
  InfoLink,
  InfoMessage,
} from "./ForgotPassword.styled";

type ViewType = "form" | "disabled" | "success";

interface ForgotPasswordQueryString {
  email?: string;
}

interface ForgotPasswordProps {
  location?: Location<ForgotPasswordQueryString>;
}

export const ForgotPassword = ({
  location,
}: ForgotPasswordProps): JSX.Element => {
  const isEmailConfigured = useSelector(getIsEmailConfigured);
  const isLdapEnabled = useSelector(getIsLdapEnabled);
  const canResetPassword = isEmailConfigured && !isLdapEnabled;
  const initialEmail = location?.query?.email;

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
