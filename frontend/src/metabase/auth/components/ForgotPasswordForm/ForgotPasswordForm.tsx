import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { Form, FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";

import type { ForgotPasswordData } from "../../types";

import {
  PasswordFormFooter,
  PasswordFormLink,
  PasswordFormTitle,
} from "./ForgotPasswordForm.styled";

const FORGOT_PASSWORD_SCHEMA = Yup.object({
  email: Yup.string().required(Errors.required).email(Errors.email),
});

interface ForgotPasswordFormProps {
  initialEmail?: string;
  onSubmit: (email: string) => void;
}

export const ForgotPasswordForm = ({
  initialEmail = "",
  onSubmit,
}: ForgotPasswordFormProps): JSX.Element => {
  const initialValues = useMemo(
    () => ({ email: initialEmail }),
    [initialEmail],
  );

  const handleSubmit = useCallback(
    ({ email }: ForgotPasswordData) => onSubmit(email),
    [onSubmit],
  );

  const applicationName = useSelector(getApplicationName);

  return (
    <div>
      <PasswordFormTitle>{t`Forgot password`}</PasswordFormTitle>
      <FormProvider
        initialValues={initialValues}
        validationSchema={FORGOT_PASSWORD_SCHEMA}
        onSubmit={handleSubmit}
      >
        <Form>
          <FormInput
            name="email"
            title={t`Email address`}
            placeholder={t`The email you use for your ${applicationName} account`}
            autoFocus
          />
          <FormSubmitButton
            title={t`Send password reset email`}
            primary
            fullWidth
          />
          <FormErrorMessage />
        </Form>
      </FormProvider>
      <PasswordFormFooter>
        <PasswordFormLink to="/auth/login">{t`Back to sign in`}</PasswordFormLink>
      </PasswordFormFooter>
    </div>
  );
};
