import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { User } from "metabase-types/api";
import { UserPasswordData } from "../../types";

const UserPasswordSchema = Yup.object({
  old_password: Yup.string().required(t`required`),
  password: Yup.string()
    .required(t`required`)
    .test(async (value = "", context) => {
      const error = await context.options.context?.onValidatePassword(value);
      return error ? context.createError({ message: error }) : true;
    }),
  password_confirm: Yup.string()
    .required(t`required`)
    .oneOf([Yup.ref("password")], t`passwords do not match`),
});

export interface UserPasswordFormProps {
  user: User;
  onValidatePassword: (password: string) => Promise<string | undefined>;
  onSubmit: (user: User, data: UserPasswordData) => void;
}

const UserPasswordForm = ({
  user,
  onValidatePassword,
  onSubmit,
}: UserPasswordFormProps): JSX.Element => {
  const initialValues = useMemo(
    () => ({ old_password: "", password: "", password_confirm: "" }),
    [],
  );

  const validationContext = useMemo(
    () => ({ onValidatePassword: _.memoize(onValidatePassword) }),
    [onValidatePassword],
  );

  const handleSubmit = useCallback(
    (data: UserPasswordData) => {
      return onSubmit(user, data);
    },
    [user, onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={UserPasswordSchema}
      validationContext={validationContext}
      onSubmit={handleSubmit}
    >
      <Form>
        <FormInput
          name="old_password"
          type="password"
          title={t`Current password`}
          placeholder={t`Shhh...`}
          autoComplete="current-password"
          fullWidth
        />
        <FormInput
          name="password"
          type="password"
          title={t`Create a password`}
          placeholder={t`Shhh...`}
          autoComplete="new-password"
          fullWidth
        />
        <FormInput
          name="password_confirm"
          type="password"
          title={t`Confirm your password`}
          placeholder={t`Shhh... but one more time so we get it right`}
          autoComplete="new-password"
          fullWidth
        />
        <FormSubmitButton title={t`Save`} primary />
        <FormErrorMessage />
      </Form>
    </FormProvider>
  );
};

export default UserPasswordForm;
