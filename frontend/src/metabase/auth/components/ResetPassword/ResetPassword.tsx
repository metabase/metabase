import React, { useMemo } from "react";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import Users from "metabase/entities/users";
import AuthLayout from "../AuthLayout/AuthLayout";
import { FormMessage, FormTitle } from "./ResetPassword.styled";
import { PasswordInfo } from "../../types";

const ResetPassword = (): JSX.Element | null => {
  return (
    <AuthLayout>
      <ResetPasswordForm onSubmit={() => undefined} />
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

export default ResetPassword;
