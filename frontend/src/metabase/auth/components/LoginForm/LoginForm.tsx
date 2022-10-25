import React from "react";
import { t } from "ttag";
import { Form, Formik } from "formik";
import * as Yup from "yup";
import FormCheckBox from "metabase/core/components/FormCheckBox";
import FormField from "metabase/core/components/FormField";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import useFormSubmit from "metabase/core/hooks/use-form-submit";
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
  const initialValues: LoginData = {
    username: "",
    password: "",
    remember: isCookieEnabled,
  };
  const handleSubmit = useFormSubmit(onSubmit);

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={isLdapEnabled ? LdapSchema : PasswordSchema}
      onSubmit={handleSubmit}
    >
      <Form>
        <FormField
          name="username"
          title={
            isLdapEnabled ? t`Username or email address` : t`Email address`
          }
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
            <FormCheckBox name="remember" />
          </FormField>
        )}
        <FormSubmitButton primary fullWidth>
          {t`Sign in`}
        </FormSubmitButton>
      </Form>
    </Formik>
  );
};

export default LoginForm;
