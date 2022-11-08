import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { jt, t } from "ttag";
import * as Yup from "yup";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { updateGoogleSettings } from "metabase/admin/settings/settings";
import {
  GoogleForm,
  GoogleFormCaption,
  GoogleFormHeader,
} from "./GoogleAuthForm.styled";

const BREADCRUMBS = [
  [t`Authentication`, "/admin/settings/authentication"],
  [t`Google Sign-In`],
];

const GoogleAuthSchema = Yup.object({
  "google-auth-client-id": Yup.string().required(t`required`),
  "google-auth-auto-create-accounts-domain": Yup.string(),
});

export interface GoogleAuthSettings {
  "google-auth-enabled": boolean;
  "google-auth-client-id": string | null;
  "google-auth-auto-create-accounts-domain": string | null;
}

export interface GoogleAuthFormProps {
  settingValues?: Partial<GoogleAuthSettings>;
  onSubmit: (settingValues: GoogleAuthSettings) => void;
}

const GoogleAuthForm = ({
  settingValues = {},
  onSubmit,
}: GoogleAuthFormProps): JSX.Element => {
  const isEnabled = settingValues["google-auth-enabled"];

  const initialValues = useMemo(() => {
    return getInitialValues(settingValues);
  }, [settingValues]);

  const handleSubmit = useCallback(
    (values: GoogleAuthSettings) => {
      return onSubmit(getSubmitValues(values));
    },
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={GoogleAuthSchema}
      enableReinitialize
      onSubmit={handleSubmit}
    >
      {({ dirty }) => (
        <GoogleForm disabled={!dirty}>
          <Breadcrumbs crumbs={BREADCRUMBS} />
          <GoogleFormHeader>{t`Sign in with Google`}</GoogleFormHeader>
          <GoogleFormCaption>
            {t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`}
          </GoogleFormCaption>
          <GoogleFormCaption>
            {jt`To allow users to sign in with Google you'll need to give Metabase a Google Developers console application client ID. It only takes a few steps and instructions on how to create a key can be found ${(
              <ExternalLink
                key="link"
                href={getDocsLink()}
              >{t`here`}</ExternalLink>
            )}.`}
          </GoogleFormCaption>
          <FormInput
            name="google-auth-client-id"
            title={t`Client ID`}
            placeholder={t`{your-client-id}.apps.googleusercontent.com`}
            fullWidth
          />
          <FormInput
            name="google-auth-auto-create-accounts-domain"
            title={t`Domain`}
            fullWidth
          />
          <FormSubmitButton
            title={isEnabled ? `Save changes` : t`Save and enable`}
            primary
            disabled={!dirty}
          />
          <FormErrorMessage />
        </GoogleForm>
      )}
    </FormProvider>
  );
};

const getInitialValues = (values: Partial<GoogleAuthSettings>) => ({
  "google-auth-enabled": true,
  "google-auth-client-id": values["google-auth-client-id"] || "",
  "google-auth-auto-create-accounts-domain":
    values["google-auth-auto-create-accounts-domain"] || "",
});

const getSubmitValues = (values: GoogleAuthSettings) => ({
  ...values,
  "google-auth-auto-create-accounts-domain":
    values["google-auth-auto-create-accounts-domain"] || null,
});

const getDocsLink = () => {
  return MetabaseSettings.docsUrl(
    "people-and-groups/google-and-ldap",
    "enabling-google-sign-in",
  );
};

const mapDispatchToProps = {
  onSubmit: updateGoogleSettings,
};

export default connect(null, mapDispatchToProps)(GoogleAuthForm);
