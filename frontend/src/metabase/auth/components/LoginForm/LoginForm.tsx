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
  const { isValid, isSubmitting, handleSubmit } = useFormik({
    initialValues: { username: "", password: "", remember: isCookieEnabled },
    validationSchema: isLdapEnabled ? LdapSchema : PasswordSchema,
    onSubmit,
  });

  return (
    <form onSubmit={handleSubmit}>
      <FormField
        name="username"
        title={isLdapEnabled ? t`Username or email address` : t`Email address`}
      >
        <FormInput
          name="username"
          type={isLdapEnabled ? "input" : "email"}
          placeholder="nicetoseeyou@email.com"
          autoFocus
          fullWidth
        />
      </FormField>
      <FormField name="password" title={t`Password`}>
        <FormInput
          name="password"
          type="password"
          placeholder={t`Shhh...`}
          fullWidth
        />
      </FormField>
      {isCookieEnabled && (
        <FormField
          name="remember"
          title={t`Remember me`}
          alignment="start"
          orientation="horizontal"
        >
          <CheckBox name="remember" />
        </FormField>
      )}
      <Button primary fullWidth disabled={!isValid || isSubmitting}>
        {t`Sign in`}
      </Button>
    </form>
  );
};

export default LoginForm;
