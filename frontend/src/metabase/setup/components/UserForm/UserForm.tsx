import React, { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import _ from "underscore";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { UserInfo } from "metabase-types/store";
import { UserFieldGroup, UserFormRoot } from "./UserForm.styled";

interface UserFormProps {
  user?: UserInfo;
  onValidatePassword: (password: string) => Promise<string | undefined>;
  onSubmit: (user: UserInfo) => void;
}

const UserForm = ({ user, onValidatePassword, onSubmit }: UserFormProps) => {
  const validationSchema = useMemo(
    () => createValidationSchema(onValidatePassword),
    [onValidatePassword],
  );

  const initialValues = useMemo(
    () => validationSchema.cast(user),
    [user, validationSchema],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      <UserFormRoot>
        <UserFieldGroup>
          <FormInput name="first_name" />
          <FormInput name="last_name" />
        </UserFieldGroup>
        <FormInput name="email" />
        <FormInput name="site_name" />
        <FormInput name="password" />
        <FormInput name="password_confirm" />
        <FormSubmitButton title={t`Next`} primary />
      </UserFormRoot>
    </FormProvider>
  );
};

const createValidationSchema = (
  onValidatePassword: (password: string) => Promise<string | undefined>,
) => {
  const handleValidatePassword = _.memoize(onValidatePassword);

  return Yup.object().shape({
    first_name: Yup.string().max(100).default(""),
    last_name: Yup.string().max(100).default(""),
    email: Yup.string()
      .required(t`required`)
      .email(t`must be a valid email address`),
    site_name: Yup.string().required(t`required`),
    password: Yup.string()
      .required(t`required`)
      .test(async (value = "", context) => {
        const error = await handleValidatePassword(value);
        return error ? context.createError({ message: error }) : true;
      }),
    password_confirm: Yup.string()
      .required(t`required`)
      .oneOf([Yup.ref("password")], t`passwords do not match`),
  });
};

export default UserForm;
