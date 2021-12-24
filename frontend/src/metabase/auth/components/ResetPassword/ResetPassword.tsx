import React, { useMemo } from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import Users from "metabase/entities/users";
import AuthLayout from "../AuthLayout/AuthLayout";
import {
  FormMessage,
  FormTitle,
  SuccessBody,
  SuccessIcon,
  SuccessIconContainer,
  SuccessMessage,
  SuccessTitle,
} from "./ResetPassword.styled";
import { PasswordInfo } from "../../types";
import Link from "metabase/components/Link";

interface ResetPasswordProps {
  showScene?: boolean;
}

const ResetPassword = ({
  showScene,
}: ResetPasswordProps): JSX.Element | null => {
  return (
    <AuthLayout showScene={showScene}>
      <ResetPasswordSuccess />
    </AuthLayout>
  );
};

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

export default ResetPassword;
