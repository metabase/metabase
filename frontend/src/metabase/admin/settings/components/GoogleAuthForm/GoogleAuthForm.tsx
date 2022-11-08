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

const ENABLED_KEY = "google-auth-enabled";
const CLIENT_ID_KEY = "google-auth-client-id";
const DOMAIN_KEY = "google-auth-auto-create-accounts-domain";

const GoogleAuthSchema = Yup.object({
  [CLIENT_ID_KEY]: Yup.string().required(t`required`),
  [DOMAIN_KEY]: Yup.string(),
});

export interface GoogleAuthSettings {
  [ENABLED_KEY]: boolean;
  [CLIENT_ID_KEY]: string | null;
  [DOMAIN_KEY]: string | null;
}

export interface GoogleAuthFormProps {
  settingValues?: Partial<GoogleAuthSettings>;
  hasMultipleDomains?: boolean;
  onSubmit: (settingValues: GoogleAuthSettings) => void;
}

const GoogleAuthForm = ({
  settingValues = {},
  hasMultipleDomains,
  onSubmit,
}: GoogleAuthFormProps): JSX.Element => {
  const isEnabled = settingValues[ENABLED_KEY];

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
              <ExternalLink key="link" href={getDocsLink()}>
                {t`here`}
              </ExternalLink>
            )}.`}
          </GoogleFormCaption>
          <FormInput
            name={CLIENT_ID_KEY}
            title={t`Client ID`}
            placeholder={t`{your-client-id}.apps.googleusercontent.com`}
            fullWidth
          />
          <FormInput
            name={DOMAIN_KEY}
            title={t`Domain`}
            description={
              hasMultipleDomains
                ? t`Allow users to sign up on their own if their Google account email address is from one of the domains you specify here:`
                : t`Allow users to sign up on their own if their Google account email address is from:`
            }
            placeholder={
              hasMultipleDomains
                ? "mycompany.com, example.com.br, otherdomain.co.uk"
                : "mycompany.com"
            }
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
  [ENABLED_KEY]: true,
  [CLIENT_ID_KEY]: values[CLIENT_ID_KEY] || "",
  [DOMAIN_KEY]: values[DOMAIN_KEY] || "",
});

const getSubmitValues = (values: GoogleAuthSettings) => ({
  ...values,
  [DOMAIN_KEY]: values[DOMAIN_KEY] || null,
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
