import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { FormErrorMessage } from "metabase/common/components/FormErrorMessage";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";

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
        <Form as={Stack} gap="md">
          <FormTextInput
            name="email"
            label={t`Email address`}
            placeholder={t`The email you use for your ${applicationName} account`}
            autoFocus
          />
          <FormSubmitButton
            label={t`Send password reset email`}
            variant="filled"
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
