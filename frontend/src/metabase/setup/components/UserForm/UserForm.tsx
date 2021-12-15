import React from "react";
import { t } from "ttag";
import User from "metabase/entities/users";
import { UserInfo } from "../../types";
import { FormProps } from "./types";
import { UserFormRoot, FormGroup } from "./UserForm.styled";

interface Props {
  user?: UserInfo;
  onSubmit: (user: UserInfo) => void;
  onValidatePassword: (user: UserInfo) => void;
}

const UserForm = ({ user, onSubmit, onValidatePassword }: Props) => {
  return (
    <UserFormRoot
      form={User.forms.setup()}
      user={user}
      asyncValidate={onValidatePassword}
      asyncBlurFields={["password"]}
      onSubmit={onSubmit}
    >
      {({ Form, FormField, FormFooter }: FormProps) => {
        return (
          <Form>
            <FormGroup>
              <FormField name="first_name" />
              <FormField name="last_name" />
            </FormGroup>
            <FormField name="email" />
            <FormField name="site_name" />
            <FormField name="password" />
            <FormField name="password_confirm" />
            <FormFooter submitTitle={t`Next`} />
          </Form>
        );
      }}
    </UserFormRoot>
  );
};

export default UserForm;
