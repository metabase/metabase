import { useMemo } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import ExternalLink from "metabase/core/components/ExternalLink";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { FormProvider } from "metabase/forms";
import MetabaseSettings from "metabase/lib/settings";
import type { SettingDefinition, Settings } from "metabase-types/api";

import { GOOGLE_SCHEMA } from "../../constants";

import {
  GoogleForm,
  GoogleFormCaption,
  GoogleFormHeader,
} from "./GoogleAuthForm.styled";

const ENABLED_KEY = "google-auth-enabled";
const CLIENT_ID_KEY = "google-auth-client-id";
const DOMAIN_KEY = "google-auth-auto-create-accounts-domain";

const BREADCRUMBS = [
  [t`Authentication`, "/admin/settings/authentication"],
  [t`Google Sign-In`],
];

export interface GoogleAuthFormProps {
  elements?: SettingDefinition[];
  settingValues?: Partial<Settings>;
  isEnabled: boolean;
  isSsoEnabled: boolean;
  onSubmit: (settingValues: Partial<Settings>) => void;
}

const GoogleAuthForm = ({
  elements = [],
  settingValues = {},
  isEnabled,
  isSsoEnabled,
  onSubmit,
}: GoogleAuthFormProps): JSX.Element => {
  const settings = useMemo(() => {
    return _.indexBy(elements, "key");
  }, [elements]);

  const initialValues = useMemo(() => {
    const values = GOOGLE_SCHEMA.cast(settingValues, { stripUnknown: true });
    return { ...values, [ENABLED_KEY]: true };
  }, [settingValues]);

  return (
    <FormProvider
      initialValues={initialValues}
      enableReinitialize
      validationSchema={GOOGLE_SCHEMA}
      validationContext={settings}
      onSubmit={onSubmit}
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
            {...getFormFieldProps(settings[CLIENT_ID_KEY])}
          />
          <FormInput
            name={DOMAIN_KEY}
            title={t`Domain`}
            description={
              isSsoEnabled
                ? t`Allow users to sign up on their own if their Google account email address is from one of the domains you specify here:`
                : t`Allow users to sign up on their own if their Google account email address is from:`
            }
            placeholder={
              isSsoEnabled
                ? "mycompany.com, example.com.br, otherdomain.co.uk"
                : "mycompany.com"
            }
            nullable
            {...getFormFieldProps(settings[DOMAIN_KEY])}
          />
          <FormSubmitButton
            title={isEnabled ? t`Save changes` : t`Save and enable`}
            primary
            disabled={!dirty}
          />
          <FormErrorMessage />
        </GoogleForm>
      )}
    </FormProvider>
  );
};

const getFormFieldProps = (setting?: SettingDefinition) => {
  if (setting?.is_env_setting) {
    return { placeholder: t`Using ${setting.env_name}`, readOnly: true };
  }
};

const getDocsLink = (): string => {
  return MetabaseSettings.docsUrl(
    "people-and-groups/google-and-ldap",
    "enabling-google-sign-in",
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default GoogleAuthForm;
