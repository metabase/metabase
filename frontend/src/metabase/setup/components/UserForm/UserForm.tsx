import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import _ from "underscore";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { UserInfo } from "metabase-types/store";
import { UserFieldGroup, UserFormRoot } from "./UserForm.styled";

const UserSchema = Yup.object({
  first_name: Yup.string().max(100, t`must be 100 characters or less`),
  last_name: Yup.string().max(100, t`must be 100 characters or less`),
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
  const initialValues = useMemo(() => {
    return getInitialValues(user);
  }, [user]);

  const validationContext = useMemo(
    () => ({
      onValidatePassword: _.memoize(onValidatePassword),
    }),
    [onValidatePassword],
  );

  const handleSubmit = useCallback(
    (values: UserInfo) => onSubmit(getSubmitValues(values)),
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={UserSchema}
      validationContext={validationContext}
      onSubmit={handleSubmit}
    >
      <UserFormRoot>
        <UserFieldGroup>
          <FormInput
            name="first_name"
            title={t`First name`}
            placeholder={t`Johnny`}
            autoFocus
            fullWidth
          />
          <FormInput
            name="last_name"
            title={t`Last name`}
            placeholder={t`Appleseed`}
            fullWidth
          />
        </UserFieldGroup>
        <FormInput
          name="email"
          type="email"
          title={t`Email`}
          placeholder="nicetoseeyou@email.com"
          fullWidth
        />
        <FormInput
          name="site_name"
          title={t`Company or team name`}
          placeholder={t`Department of Awesome`}
          fullWidth
        />
        <FormInput
          name="password"
          type="password"
          title={t`Create a password`}
          placeholder={t`Shhh...`}
          fullWidth
        />
        <FormInput
          name="password_confirm"
          type="password"
          title={t`Confirm your password`}
          placeholder={t`Shhh... but one more time so we get it right`}
          fullWidth
        />
        <FormSubmitButton title={t`Next`} primary />
      </UserFormRoot>
    </FormProvider>
  );
};

const getInitialValues = (user?: UserInfo): UserInfo => {
  return {
    email: "",
    site_name: "",
    password: "",
    password_confirm: "",
    ...user,
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
  };
};

const getSubmitValues = (user: UserInfo): UserInfo => {
  return {
    ...user,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
  };
};

export default UserForm;
