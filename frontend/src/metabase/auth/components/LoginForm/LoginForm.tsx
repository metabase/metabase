import React from "react";
import { t } from "ttag";
import { useFormik } from "formik";
import type { FormikErrors } from "formik";
import Utils from "metabase/lib/utils";
import Button from "metabase/core/components/Button";
import Input from "metabase/core/components/Input";
import FormField from "metabase/core/components/FormField";
import { LoginData } from "../../types";

export interface LoginFormProps {
  isLdapEnabled: boolean;
  onSubmit: (data: LoginData) => void;
}

const LoginForm = ({
  isLdapEnabled,
  onSubmit,
}: LoginFormProps): JSX.Element => {
  const { getFieldProps, getFieldMeta, handleSubmit, isValid, isSubmitting } =
    useFormik({
      initialValues: { username: "", password: "" },
      validate: data => validateForm(data, isLdapEnabled),
      onSubmit,
    });

  return (
    <form onSubmit={handleSubmit}>
      <FormField
        {...getFieldMeta("username")}
        title={isLdapEnabled ? t`Username or email address` : t`Email address`}
      >
        <Input
          {...getFieldProps("username")}
          {...getFieldMeta("username")}
          type={isLdapEnabled ? "input" : "email"}
          placeholder="nicetoseeyou@email.com"
          autoFocus
          fullWidth
        />
      </FormField>
      <FormField {...getFieldMeta("password")} title={t`Password`}>
        <Input
          {...getFieldProps("password")}
          {...getFieldMeta("password")}
          type="password"
          placeholder={t`Shhh...`}
          fullWidth
        />
      </FormField>
      <Button primary fullWidth disabled={!isValid || isSubmitting}>
        {t`Sign in`}
      </Button>
    </form>
  );
};

const validateForm = (
  values: LoginData,
  isLdapEnabled: boolean,
): FormikErrors<LoginData> => {
  const errors: FormikErrors<LoginData> = {};

  if (!values.username) {
    errors.username = t`required`;
  } else if (!isLdapEnabled && !Utils.isEmail(values.username)) {
    errors.username = t`must be a valid email address`;
  }

  if (!values.password) {
    errors.password = t`required`;
  }

  return errors;
};

export default LoginForm;
