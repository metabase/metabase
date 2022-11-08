import React, { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { jt, t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { updateGoogleSettings } from "metabase/admin/settings/settings";
import { SettingDefinition } from "metabase-types/api";
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
  elements?: SettingDefinition[];
  settingValues?: Partial<GoogleAuthSettings>;
  onSubmit: (settingValues: GoogleAuthSettings) => void;
}

const GoogleAuthForm = ({
  elements = [],
  settingValues = {},
  onSubmit,
}: GoogleAuthFormProps): JSX.Element => {
  const settings = _.indexBy(elements, "key");
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
              <ExternalLink key="link" href={getDocsLink()}>
                {t`here`}
              </ExternalLink>
            )}.`}
          </GoogleFormCaption>
          <FormInput
            {...getProps(settings["google-auth-client-id"])}
            name="google-auth-client-id"
            title={t`Client ID`}
            placeholder={t`{your-client-id}.apps.googleusercontent.com`}
            fullWidth
          />
          <FormInput
            {...getProps(settings["google-auth-auto-create-accounts-domain"])}
            name="google-auth-auto-create-accounts-domain"
            title={t`Domain`}
            description={t`Allow users to sign up on their own if their Google account email address is from:`}
            placeholder="mycompany.com"
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

const getProps = (setting?: SettingDefinition) => {
  if (setting?.is_env_setting) {
    return {
      readOnly: true,
      placeholder: t`Using ${setting.env_name}`,
    };
  }
};

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
