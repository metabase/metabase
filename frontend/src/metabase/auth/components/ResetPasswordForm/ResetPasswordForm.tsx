import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { Form, FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import MetabaseSettings from "metabase/lib/settings";

import type { ResetPasswordData } from "../../types";

import {
  PasswordFormMessage,
  PasswordFormTitle,
} from "./ResetPasswordForm.styled";

const RESET_PASSWORD_SCHEMA = Yup.object({
  password: Yup.string()
    .default("")
    .required(Errors.required)
    .test(async (value = "", context) => {
      const error = await context.options.context?.onValidatePassword(value);
      return error ? context.createError({ message: error }) : true;
    }),
  password_confirm: Yup.string()
    .default("")
    .required(Errors.required)
    .oneOf([Yup.ref("password")], t`passwords do not match`),
});

interface ResetPasswordFormProps {
  onValidatePassword: (password: string) => Promise<string | undefined>;
  onSubmit: (data: ResetPasswordData) => void;
}

export const ResetPasswordForm = ({
  onValidatePassword,
  onSubmit,
}: ResetPasswordFormProps): JSX.Element => {
  const initialValues = useMemo(() => {
    return RESET_PASSWORD_SCHEMA.getDefault();
  }, []);

  const passwordDescription = useMemo(() => {
    return MetabaseSettings.passwordComplexityDescription();
  }, []);

  const validationContext = useMemo(
    () => ({ onValidatePassword: _.memoize(onValidatePassword) }),
    [onValidatePassword],
  );

  return (
    <div>
      <PasswordFormTitle>{t`New password`}</PasswordFormTitle>
      <PasswordFormMessage>
        {t`To keep your data secure, passwords ${passwordDescription}`}
      </PasswordFormMessage>
      <FormProvider
        initialValues={initialValues}
        validationSchema={RESET_PASSWORD_SCHEMA}
        validationContext={validationContext}
        onSubmit={onSubmit}
      >
        <Form>
          <FormInput
            name="password"
            type="password"
            title={t`Create a password`}
            placeholder={t`Shhh...`}
            autoComplete="new-password"
            autoFocus
          />
          <FormInput
            name="password_confirm"
            type="password"
            title={t`Confirm your password`}
            placeholder={t`Shhh... but one more time so we get it right`}
            autoComplete="new-password"
          />
          <FormSubmitButton title={t`Save new password`} primary fullWidth />
          <FormErrorMessage />
        </Form>
      </FormProvider>
    </div>
  );
};
