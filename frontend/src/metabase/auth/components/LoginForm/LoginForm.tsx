import React from "react";
import { t } from "ttag";
import { useFormik } from "formik";
import * as Yup from "yup";
import Button from "metabase/core/components/Button";
import CheckBox from "metabase/core/components/CheckBox";
import FormInput from "metabase/core/components/FormInput";
import FormField from "metabase/core/components/FormField";
import { LoginData } from "../../types";

const LdapSchema = Yup.object().shape({
  username: Yup.string().required(t`required`),
  password: Yup.string().required(t`required`),
  remember: Yup.boolean(),
});

const PasswordSchema = LdapSchema.shape({
  username: Yup.string()
    .required(t`required`)
    .email(t`must be a valid email address`),
});

export interface LoginFormProps {
  isLdapEnabled: boolean;
  isCookieEnabled: boolean;
  onSubmit: (data: LoginData) => void;
}

const LoginForm = ({
  isLdapEnabled,
  isCookieEnabled,
  onSubmit,
}: LoginFormProps): JSX.Element => {
  const { getFieldProps, getFieldMeta, handleSubmit, isValid, isSubmitting } =
    useFormik({
      initialValues: { username: "", password: "", remember: isCookieEnabled },
      validationSchema: isLdapEnabled ? LdapSchema : PasswordSchema,
      onSubmit,
    });

  return (
    <form onSubmit={handleSubmit}>
      <FormField
        {...getFieldMeta("username")}
        title={isLdapEnabled ? t`Username or email address` : t`Email address`}
      >
        <FormInput
          {...getFieldProps("username")}
          {...getFieldMeta("username")}
          type={isLdapEnabled ? "input" : "email"}
          placeholder="nicetoseeyou@email.com"
          autoFocus
          fullWidth
        />
      </FormField>
      <FormField {...getFieldMeta("password")} title={t`Password`}>
        <FormInput
          {...getFieldProps("password")}
          {...getFieldMeta("password")}
          type="password"
          placeholder={t`Shhh...`}
          fullWidth
        />
      </FormField>
      {isCookieEnabled && (
        <FormField
          title={t`Remember me`}
          alignment="start"
          orientation="horizontal"
        >
          <CheckBox {...getFieldProps("remember")} />
        </FormField>
      )}
      <Button primary fullWidth disabled={!isValid || isSubmitting}>
        {t`Sign in`}
      </Button>
    </form>
  );
};

export default LoginForm;
