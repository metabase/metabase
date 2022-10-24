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
  const {
    values,
    errors,
    touched,
    isValid,
    isSubmitting,
    handleChange,
    handleSubmit,
  } = useFormik({
    initialValues: { username: "", password: "", remember: isCookieEnabled },
    validationSchema: isLdapEnabled ? LdapSchema : PasswordSchema,
    onSubmit,
  });

  return (
    <form onSubmit={handleSubmit}>
      <FormField
        title={isLdapEnabled ? t`Username or email address` : t`Email address`}
        error={touched.username && errors.username}
      >
        <FormInput
          name="username"
          value={values.username}
          error={touched.username && errors.username}
          type={isLdapEnabled ? "input" : "email"}
          placeholder="nicetoseeyou@email.com"
          autoFocus
          fullWidth
          onChange={handleChange}
        />
      </FormField>
      <FormField
        title={t`Password`}
        error={touched.password && errors.password}
      >
        <FormInput
          name="password"
          value={values.password}
          error={touched.password && errors.password}
          type="password"
          placeholder={t`Shhh...`}
          fullWidth
          onChange={handleChange}
        />
      </FormField>
      {isCookieEnabled && (
        <FormField
          title={t`Remember me`}
          alignment="start"
          orientation="horizontal"
        >
          <CheckBox
            name="remember"
            checked={values.remember}
            onChange={handleChange}
          />
        </FormField>
      )}
      <Button primary fullWidth disabled={!isValid || isSubmitting}>
        {t`Sign in`}
      </Button>
    </form>
  );
};

export default LoginForm;
