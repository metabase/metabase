import React from "react";
import { t } from "ttag";
import User from "metabase/entities/users";
import { UserInfo } from "../../types";
import { FormProps, FormError } from "./types";
import { UserFormRoot, FormGroup } from "./UserForm.styled";

interface Props {
  user?: UserInfo;
  onSubmit: (user: UserInfo) => void;
  onValidatePassword: (user: UserInfo) => void;
}

const UserForm = ({ user, onSubmit, onValidatePassword }: Props) => {
  const handleValidate = async (user: UserInfo) => {
    try {
      await onValidatePassword(user);
      return {};
    } catch (error) {
      if (isFormError(error)) {
        return error.data.errors;
      } else {
        throw error;
      }
    }
  };

  return (
    <UserFormRoot
      form={User.forms.setup()}
      user={user}
      asyncValidate={handleValidate}
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

const isFormError = (error: unknown): error is FormError => {
  return typeof error === "object";
};

export default UserForm;
