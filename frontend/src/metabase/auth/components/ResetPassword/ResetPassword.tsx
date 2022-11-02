import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import _ from "underscore";
import MetabaseSettings from "metabase/lib/settings";
import Link from "metabase/core/components/Link";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import AuthLayout from "../../containers/AuthLayout";
import { ResetPasswordData } from "../../types";
import {
  FormMessage,
  FormTitle,
  InfoBody,
  InfoMessage,
  InfoTitle,
} from "./ResetPassword.styled";

type ViewType = "none" | "form" | "success" | "expired";

export interface ResetPasswordProps {
  token: string;
  onResetPassword: (token: string, password: string) => void;
  onValidatePassword: (password: string) => Promise<string | undefined>;
  onValidatePasswordToken: (token: string) => void;
  onShowToast: (toast: { message: string }) => void;
  onRedirect: (url: string) => void;
}

const ResetPassword = ({
  token,
  onResetPassword,
  onValidatePassword,
  onValidatePasswordToken,
  onShowToast,
  onRedirect,
}: ResetPasswordProps): JSX.Element | null => {
  const [view, setView] = useState<ViewType>("none");

  const handleLoad = useCallback(async () => {
    try {
      await onValidatePasswordToken(token);
      setView("form");
    } catch (error) {
      setView("expired");
    }
  }, [token, onValidatePasswordToken]);

  const handlePasswordSubmit = useCallback(
    async ({ password }: ResetPasswordData) => {
      await onResetPassword(token, password);
      onRedirect("/");
      onShowToast({ message: t`You've updated your password.` });
    },
    [onResetPassword, token, onRedirect, onShowToast],
  );

  useEffect(() => {
    handleLoad();
  }, [handleLoad]);

  return (
    <AuthLayout>
      {view === "form" && (
        <ResetPasswordForm
          onValidatePassword={onValidatePassword}
          onSubmit={handlePasswordSubmit}
        />
      )}
      {view === "expired" && <ResetPasswordExpired />}
    </AuthLayout>
  );
};

interface ResetPasswordFormProps {
  onValidatePassword: (password: string) => Promise<string | undefined>;
  onSubmit: (data: ResetPasswordData) => void;
}

const ResetPasswordForm = ({
  onValidatePassword,
  onSubmit,
}: ResetPasswordFormProps): JSX.Element => {
  const initialValues = useMemo(
    () => ({ password: "", password_confirm: "" }),
    [],
  );

  const passwordDescription = useMemo(
    () => MetabaseSettings.passwordComplexityDescription(),
    [],
  );

  const validationSchema = useMemo(
    () => createValidationSchema(onValidatePassword),
    [onValidatePassword],
  );

  return (
    <div>
      <FormTitle>{t`New password`}</FormTitle>
      <FormMessage>
        {t`To keep your data secure, passwords ${passwordDescription}`}
      </FormMessage>
      <FormProvider
        initialValues={initialValues}
        validationSchema={validationSchema}
        isInitialValid={false}
        onSubmit={onSubmit}
      >
        <Form>
          <FormInput
            name="password"
            type="password"
            title={t`Create a password`}
            placeholder={t`Shhh...`}
            autoFocus
            fullWidth
          />
          <FormInput
            name="password_confirm"
            type="password"
            title={t`Confirm your password`}
            placeholder={t`Shhh... but one more time so we get it right`}
            fullWidth
          />
          <FormSubmitButton title={t`Save new password`} primary fullWidth />
          <FormErrorMessage />
        </Form>
      </FormProvider>
    </div>
  );
};

const ResetPasswordExpired = (): JSX.Element => {
  return (
    <InfoBody>
      <InfoTitle>{t`Whoops, that's an expired link`}</InfoTitle>
      <InfoMessage>
        {t`For security reasons, password reset links expire after a little while. If you still need to reset your password, you can request a new reset email.`}
      </InfoMessage>
      <Link
        className="Button Button--primary"
        to={"/auth/forgot_password"}
      >{t`Request a new reset email`}</Link>
    </InfoBody>
  );
};

const createValidationSchema = (
  onValidatePassword: (password: string) => Promise<string | undefined>,
) => {
  const onPasswordChange = _.memoize(onValidatePassword);

  return Yup.object().shape({
    password: Yup.string()
      .required(t`required`)
      .test(async (value = "", context) => {
        const error = await onPasswordChange(value);
        return error ? context.createError({ message: error }) : true;
      }),
    password_confirm: Yup.string()
      .required(t`required`)
      .oneOf([Yup.ref("password")], t`passwords do not match`),
  });
};

export default ResetPassword;
