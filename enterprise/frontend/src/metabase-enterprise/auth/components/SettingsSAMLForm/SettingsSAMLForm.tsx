import { useCallback } from "react";
import { jt, t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { GroupMappingsWidget } from "metabase/admin/settings/components/widgets/GroupMappingsWidget";
import { getExtraFormFieldProps } from "metabase/admin/settings/utils";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Markdown } from "metabase/common/components/Markdown";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSection,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Flex, Stack, Text, Title } from "metabase/ui";
import { useUpdateSamlMutation } from "metabase-enterprise/api";
import type { EnterpriseSettings } from "metabase-types/api";

export type SAMLFormSettings = Pick<
  EnterpriseSettings,
  | "saml-user-provisioning-enabled?"
  | "saml-attribute-email"
  | "saml-attribute-firstname"
  | "saml-attribute-lastname"
  | "saml-attribute-tenant"
  | "saml-identity-provider-uri"
  | "saml-identity-provider-issuer"
  | "saml-identity-provider-certificate"
  | "saml-application-name"
  | "saml-keystore-password"
  | "saml-keystore-alias"
  | "saml-keystore-path"
  | "saml-attribute-group"
  | "saml-group-sync"
>;

const SAML_FORM_SCHEMA = Yup.object({
  "saml-attribute-group": Yup.string().nullable().default(null),
});

export function SettingsSAMLForm() {
  const { data: settingDetails, isLoading: isLoadingDetails } =
    useGetAdminSettingsDetailsQuery();
  const { data: settingValues, isLoading: isLoadingValues } =
    useGetSettingsQuery();
  const [updateSamlSettings] = useUpdateSamlMutation();

  const isEnabled = Boolean(settingValues?.["saml-enabled"]);

  const handleSubmit = useCallback(
    (values: SAMLFormSettings) => {
      return updateSamlSettings({ ...values, "saml-enabled": true }).unwrap();
    },
    [updateSamlSettings],
  );

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Admin settings
  const { url: docsUrl } = useDocsUrl(
    "people-and-groups/authenticating-with-saml",
  );

  const siteUrl = useSetting("site-url");

  if (isLoadingDetails || isLoadingValues) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!settingDetails || !settingValues) {
    return (
      <LoadingAndErrorWrapper error={t`Error loading SAML configuration`} />
    );
  }

  return (
    <SettingsPageWrapper title={t`SAML`}>
      {isEnabled && <SamlUserProvisioning />}
      <SettingsSection>
        <FormProvider
          initialValues={getFormValues(settingValues ?? {})}
          onSubmit={handleSubmit}
          validationSchema={SAML_FORM_SCHEMA}
          enableReinitialize
        >
          {({ dirty }) => (
            <Form>
              <Title order={2}>{t`Set up SAML-based SSO`}</Title>
              <Text c="text-secondary" mb="xl">
                {jt`Use the settings below to configure your SSO via SAML. If you have any questions, check out our ${(
                  <ExternalLink
                    key="link"
                    href={docsUrl}
                  >{t`documentation`}</ExternalLink>
                )}.`}
              </Text>
              <FormSection title={t`Configure your identity provider (IdP)`}>
                <Text c="text-secondary" mb="xl">
                  {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
                  {t`Your identity provider will need the following info about Metabase.`}
                </Text>

                <CopyTextInput
                  value={`${siteUrl}/auth/sso`}
                  label={t`URL the IdP should redirect back to`}
                  description={t`This is called the Single Sign On URL in Okta, the Application Callback URL in Auth0, and the ACS (Consumer) URL in OneLogin. `}
                  readOnly
                />

                <Title order={4} mt="xl">{t`SAML attributes`}</Title>
                <Text c="text-secondary" mb="md">
                  {t`In most IdPs, you'll need to put each of these in an input box labeled "Name" in the attribute statements section.`}
                </Text>

                <Stack gap="md">
                  <FormTextInput
                    name="saml-attribute-email"
                    label={t`User's email attribute`}
                    hasCopyButton
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-attribute-email"],
                    )}
                  />
                  <FormTextInput
                    name="saml-attribute-firstname"
                    label={t`User's first name attribute`}
                    hasCopyButton
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-attribute-firstname"],
                    )}
                  />
                  <FormTextInput
                    name="saml-attribute-lastname"
                    label={t`User's last name attribute`}
                    hasCopyButton
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-attribute-lastname"],
                    )}
                  />
                  {settingValues["use-tenants"] && (
                    <FormTextInput
                      name="saml-attribute-tenant"
                      label={t`Tenant assignment attribute`}
                      hasCopyButton
                      {...getExtraFormFieldProps(
                        settingDetails?.["saml-attribute-tenant"],
                      )}
                    />
                  )}
                </Stack>
              </FormSection>

              <FormSection
                // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings
                title={t`Tell Metabase about your identity provider`}
              >
                <Text mb="xl" mt="sm" c="text-secondary">
                  {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
                  {t`Metabase will need the following info about your provider.`}
                </Text>
                <Stack gap="md">
                  <FormTextInput
                    name="saml-identity-provider-uri"
                    label={t`SAML identity provider URL`}
                    placeholder="https://your-org-name.yourIDP.com"
                    required
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-identity-provider-uri"],
                    )}
                  />
                  <FormTextarea
                    name="saml-identity-provider-certificate"
                    label={t`SAML identity provider certificate`}
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-identity-provider-certificate"],
                    )}
                    required
                  />
                  <FormTextInput
                    name="saml-application-name"
                    label={t`SAML application name`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-application-name"],
                    )}
                  />
                  <FormTextInput
                    name="saml-identity-provider-issuer"
                    label={t`SAML identity provider issuer`}
                    required
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-identity-provider-issuer"],
                    )}
                  />
                </Stack>
              </FormSection>

              <FormSection title={t`Sign SSO requests (optional)`} collapsible>
                <Stack gap="md">
                  <FormTextInput
                    name="saml-keystore-path"
                    label={t`SAML keystore path`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-keystore-path"],
                    )}
                  />
                  <FormTextInput
                    name="saml-keystore-password"
                    label={t`SAML keystore password`}
                    type="password"
                    placeholder={t`Shh...`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-keystore-password"],
                    )}
                  />
                  <FormTextInput
                    name="saml-keystore-alias"
                    label={t`SAML keystore alias`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-keystore-alias"],
                    )}
                  />
                </Stack>
              </FormSection>

              <FormSection
                title={t`Synchronize group membership with your SSO`}
              >
                <Text c="text-secondary" mb="lg">
                  {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
                  {t`To enable this, you'll need to create mappings to tell Metabase which group(s) your users should
                be added to based on the SSO group they're in.`}
                </Text>
                <Stack gap="md">
                  <GroupMappingsWidget
                    isFormik
                    // map to legacy setting props
                    setting={{ key: "saml-group-sync" }}
                    onChange={handleSubmit}
                    settingValues={settingValues}
                    mappingSetting="saml-group-mappings"
                    groupHeading={t`Group name`}
                    groupPlaceholder={t`Group name`}
                  />
                  <FormTextInput
                    name="saml-attribute-group"
                    label={t`Group attribute name`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["saml-attribute-group"],
                    )}
                  />
                </Stack>
              </FormSection>

              <FormErrorMessage />
              <Flex justify="end">
                <FormSubmitButton
                  disabled={!dirty}
                  label={isEnabled ? t`Save changes` : t`Save and enable`}
                  variant="filled"
                />
              </Flex>
            </Form>
          )}
        </FormProvider>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}

const getFormValues = (
  allSettings: Partial<EnterpriseSettings>,
): SAMLFormSettings => {
  const samlSettings = _.pick(allSettings, [
    "saml-user-provisioning-enabled?",
    "saml-attribute-email",
    "saml-attribute-firstname",
    "saml-attribute-lastname",
    "saml-attribute-tenant",
    "saml-identity-provider-uri",
    "saml-identity-provider-issuer",
    "saml-identity-provider-certificate",
    "saml-application-name",
    "saml-keystore-password",
    "saml-keystore-alias",
    "saml-keystore-path",
    "saml-attribute-group",
    "saml-group-sync",
  ]);

  if (samlSettings["saml-user-provisioning-enabled?"] == null) {
    // cast empty to false
    samlSettings["saml-user-provisioning-enabled?"] = false;
  }
  // cast undefined to null
  return _.mapObject(samlSettings, (val) => val ?? null) as SAMLFormSettings;
};

function SamlUserProvisioning() {
  const scimEnabled = useSetting("scim-enabled");

  if (scimEnabled) {
    return (
      <SettingsSection>
        <SettingHeader
          id="saml-user-provisioning-enabled?"
          title={t`User provisioning`}
          description={
            <Markdown>
              {t`You cannot enable SAML user provisioning while user provisioning is [managed by SCIM]` +
                "(/admin/settings/authentication/user-provisioning)."}
            </Markdown>
          }
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection>
      <AdminSettingInput
        name="saml-user-provisioning-enabled?"
        title={t`User provisioning`}
        inputType="boolean"
      />
    </SettingsSection>
  );
}
