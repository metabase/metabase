import React, { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import _ from "underscore";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { UserInfo } from "metabase-types/store";
import { UserFieldGroup, UserFormRoot } from "./UserForm.styled";

const DEFAULT_VALUES: UserInfo = {
  first_name: "",
  last_name: "",
  email: "",
  site_name: "",
  password: "",
  password_confirm: "",
};

const UserSchema = Yup.object({
  first_name: Yup.string().max(
    100,
    ({ max }) => t`must be ${max} characters or less`,
  ),
  last_name: Yup.string().max(
    100,
    ({ max }) => t`must be ${max} characters or less`,
  ),
  email: Yup.string()
    .required(t`required`)
    .email(t`must be a valid email address`),
  site_name: Yup.string().required(t`required`),
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

interface UserFormProps {
  user?: UserInfo;
  onValidatePassword: (password: string) => Promise<string | undefined>;
  onSubmit: (user: UserInfo) => void;
}

const UserForm = ({ user, onValidatePassword, onSubmit }: UserFormProps) => {
  const validationContext = useMemo(
    () => ({
      onValidatePassword: _.memoize(onValidatePassword),
    }),
    [onValidatePassword],
  );

  return (
    <FormProvider
      initialValues={user ?? DEFAULT_VALUES}
      validationSchema={UserSchema}
      validationContext={validationContext}
      onSubmit={onSubmit}
    >
      <UserFormRoot>
        <UserFieldGroup>
          <FormInput
            name="first_name"
            title={t`First name`}
            placeholder={t`Johnny`}
            autoFocus
          />
          <FormInput
            name="last_name"
            title={t`Last name`}
            placeholder={t`Appleseed`}
          />
        </UserFieldGroup>
        <FormInput
          name="email"
          type="email"
          title={t`Email`}
          placeholder="nicetoseeyou@email.com"
        />
        <FormInput
          name="site_name"
          title={t`Company or team name`}
          placeholder={t`Department of Awesome`}
        />
        <FormInput
          name="password"
          type="password"
          title={t`Create a password`}
          placeholder={t`Shhh...`}
        />
        <FormInput
          name="password_confirm"
          type="password"
          title={t`Confirm your password`}
          placeholder={t`Shhh... but one more time so we get it right`}
        />
        <FormSubmitButton title={t`Next`} primary />
      </UserFormRoot>
    </FormProvider>
  );
};

export default UserForm;
