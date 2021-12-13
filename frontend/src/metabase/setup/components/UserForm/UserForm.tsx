import React, { ComponentType, useMemo } from "react";
import { t } from "ttag";
import User from "metabase/entities/users";
import { UserInfo } from "../../types";

interface Props {
  user?: UserInfo;
  onSubmit: (user: UserInfo) => void;
  onValidatePassword: (user: UserInfo) => void;
}

const UserForm = ({ user, onSubmit, onValidatePassword }: Props) => {
  return (
    <User.Form
      form={User.forms.setup()}
      user={user}
      asyncValidate={onValidatePassword}
      asyncBlurFields={["password"]}
      onSubmit={onSubmit}
    >
      {getFormFields}
    </User.Form>
  );
};

interface FormOpts {
  Form: ComponentType;
  FormField: ComponentType<{ name: string }>;
  FormFooter: ComponentType<{ submitTitle?: string }>;
}

const getFormFields = ({ Form, FormField, FormFooter }: FormOpts) => {
  return (
    <Form>
      <FormField name="first_name" />
      <FormField name="last_name" />
      <FormField name="email" />
      <FormField name="site_name" />
      <FormField name="password" />
      <FormField name="password_confirm" />
      <FormFooter submitTitle={t`Next`} />
    </Form>
  );
};

export default UserForm;
