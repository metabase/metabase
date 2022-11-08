import React, { useCallback } from "react";
import { connect } from "react-redux";
import { jt, t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import {
  FormField,
  FormMessage,
  FormSubmit,
} from "metabase/containers/FormikForm";
import { updateGoogleSettings } from "metabase/admin/settings/settings";
import { settingToFormField } from "metabase/admin/settings/utils";
import {
  FormCaption,
  FormSection,
  FormHeader,
  FormRoot,
} from "./SettingsGoogleForm.styled";

export interface SettingElement {
  key: string;
}

export interface SettingsGoogleFormProps {
  elements?: SettingElement[];
  settingValues?: Record<string, unknown>;
  onSubmit: (settingValues: Record<string, unknown>) => void;
}

const SettingsGoogleForm = ({
  elements = [],
  settingValues = {},
  onSubmit,
}: SettingsGoogleFormProps) => {
  const isEnabled = Boolean(settingValues["google-auth-enabled"]);

  const handleSubmit = useCallback(
    (values: Record<string, unknown>) => {
      return onSubmit({ ...values, "google-auth-enabled": true });
    },
    [onSubmit],
  );

  return (
    <FormRoot
      initialValues={settingValues}
      disablePristineSubmit
      overwriteOnInitialValuesChange
      onSubmit={handleSubmit}
    >
      <Breadcrumbs
        crumbs={[
          [t`Authentication`, "/admin/settings/authentication"],
          [t`Google Sign-In`],
        ]}
      />
      <FormHeader>{t`Sign in with Google`}</FormHeader>
      <FormCaption>
        {t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`}
      </FormCaption>
      <FormCaption>
        {jt`To allow users to sign in with Google you'll need to give Metabase a Google Developers console application client ID. It only takes a few steps and instructions on how to create a key can be found ${(
          <ExternalLink key="link" href={getDocsLink()}>{t`here`}</ExternalLink>
        )}.`}
      </FormCaption>
      <FormField
        {...getField("google-auth-client-id", elements)}
        title={t`Client ID`}
        description=""
        placeholder={t`{your-client-id}.apps.googleusercontent.com`}
        required
        autoFocus
      />
      <FormField
        {...getField("google-auth-auto-create-accounts-domain", elements)}
        title={t`Domain`}
      />
      <FormSection>
        <FormMessage />
      </FormSection>
      <FormSection>
        <FormSubmit>
          {isEnabled ? t`Save changes` : t`Save and enable`}
        </FormSubmit>
      </FormSection>
    </FormRoot>
  );
};

const getField = (name: string, elements: SettingElement[]) => {
  const setting = elements.find(e => e.key === name) ?? { key: name };
  return settingToFormField(setting);
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

export default connect(null, mapDispatchToProps)(SettingsGoogleForm);
