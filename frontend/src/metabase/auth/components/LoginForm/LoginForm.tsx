import React from "react";
import { t } from "ttag";
import { Form, Formik } from "formik";
import * as Yup from "yup";
import useForm from "metabase/core/hooks/use-form";
import FormCheckBox from "metabase/core/components/FormCheckBox";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { LoginData } from "../../types";

const LDAP_SCHEMA = Yup.object().shape({
  username: Yup.string().required(t`required`),
  password: Yup.string().required(t`required`),
  remember: Yup.boolean(),
});

const PASSWORD_SCHEMA = LDAP_SCHEMA.shape({
  username: Yup.string()
    .required(t`required`)
    .email(t`must be a valid email address`),
});

export interface LoginFormProps {
  isLdapEnabled: boolean;
  hasSessionCookies: boolean;
  onSubmit: (data: LoginData) => void;
}

const LoginForm = ({
  isLdapEnabled,
  hasSessionCookies,
  onSubmit,
}: LoginFormProps): JSX.Element => {
  const initialValues: LoginData = {
    username: "",
    password: "",
    remember: !hasSessionCookies,
  };
  const handleSubmit = useForm(onSubmit);

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={isLdapEnabled ? LDAP_SCHEMA : PASSWORD_SCHEMA}
      isInitialValid={false}
      onSubmit={handleSubmit}
    >
      <Form>
        <FormInput
          name="username"
          title={
            isLdapEnabled ? t`Username or email address` : t`Email address`
          }
          type={isLdapEnabled ? "input" : "email"}
          placeholder="nicetoseeyou@email.com"
          autoFocus
          fullWidth
        />
        <FormInput
          name="password"
          title={t`Password`}
          type="password"
          placeholder={t`Shhh...`}
          fullWidth
        />
        {!hasSessionCookies && (
          <FormCheckBox name="remember" title={t`Remember me`} />
        )}
        <FormSubmitButton title={t`Sign in`} fullWidth />
        <FormErrorMessage />
      </Form>
    </Formik>
  );
};

export default LoginForm;
