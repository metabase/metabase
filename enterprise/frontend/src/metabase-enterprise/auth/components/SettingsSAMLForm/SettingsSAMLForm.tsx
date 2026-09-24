import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { SettingsGroupMappingSection } from "metabase/admin/settings/auth/components/GroupMappings";
import {
  SETTINGS_FIELD_DESCRIPTION_PROPS,
  getDefaultPlaceholder,
  getEnvNoticeProps,
  getExtraFormFieldProps,
  getStoredFieldValue,
} from "metabase/admin/settings/utils";
import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Markdown } from "metabase/common/components/Markdown";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
  useSetting,
} from "metabase/settings";
import {
  CollapsibleSettingsSection,
  SETTINGS_CARD_DESCRIPTION_PROPS,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";
import { Box, Flex, Stack, Text, Title } from "metabase/ui";
import { useUpdateSamlMutation } from "metabase-enterprise/api";
import { UserProvisioningSection } from "metabase-enterprise/auth/components/UserProvisioningSection";
import type {
  EnterpriseSettings,
  SettingDefinitionMap,
} from "metabase-types/api";

export type SAMLFormSettings = Pick<
  EnterpriseSettings,
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
  const isConfigured = settingValues?.["saml-configured"] ?? false;

  const handleSubmit = useCallback(
    (values: SAMLFormSettings) => {
      return updateSamlSettings({ ...values, "saml-enabled": true }).unwrap();
    },
    [updateSamlSettings],
  );

  const applicationName = useSelector(getApplicationName);
  const siteUrl = useSetting("site-url");
  const scimEnabled = useSetting("scim-enabled");

  if (isLoadingDetails || isLoadingValues) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!settingDetails || !settingValues) {
    return (
      <LoadingAndErrorWrapper error={t`Error loading SAML configuration`} />
    );
  }

  // saml-keystore-password is sensitive, so session properties never
  // include it; path and alias are the detectable signals
  const hasKeystoreSettings = Boolean(
    settingValues["saml-keystore-path"] || settingValues["saml-keystore-alias"],
  );

  // the backend keeps SAML provisioning off while SCIM owns provisioning
  const scimNote = scimEnabled && (
    <Markdown>
      {t`You cannot enable SAML user provisioning while user provisioning is [managed by SCIM]` +
        "(/admin/settings/authentication/user-provisioning)."}
    </Markdown>
  );

  return (
    <SettingsPageWrapper title={t`SAML`}>
      <FormProvider
        initialValues={getFormValues(settingDetails, settingValues)}
        onSubmit={handleSubmit}
        validationSchema={SAML_FORM_SCHEMA}
        enableReinitialize
      >
        {({ dirty, initialValues, isSubmitting, setFieldValue }) => (
          <Form>
            <Stack gap="xl">
              <SettingsSection
                title={t`Identity provider (IdP) configuration`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <CopyTextInput
                  value={`${siteUrl}/auth/sso`}
                  label={t`URL the IdP should redirect back to`}
                  description={t`This is called the Single Sign On URL in Okta, the Application Callback URL in Auth0, and the ACS (Consumer) URL in OneLogin. `}
                  descriptionProps={SETTINGS_FIELD_DESCRIPTION_PROPS}
                  readOnly
                />

                <Box mt="xxl">
                  <Title order={3} size="h5">{t`SAML attributes`}</Title>
                  <Text c="text-secondary" {...SETTINGS_CARD_DESCRIPTION_PROPS}>
                    {t`In most IdPs, you'll need to put each of these in an input box labeled "Name" in the attribute statements section.`}
                  </Text>
                </Box>

                <Stack gap="lg">
                  <FormTextInput
                    name="saml-attribute-email"
                    label={t`User's email attribute`}
                    hasCopyButton
                    {...getEnvNoticeProps(
                      settingDetails["saml-attribute-email"],
                    )}
                  />
                  <FormTextInput
                    name="saml-attribute-firstname"
                    label={t`User's first name attribute`}
                    hasCopyButton
                    {...getEnvNoticeProps(
                      settingDetails["saml-attribute-firstname"],
                    )}
                  />
                  <FormTextInput
                    name="saml-attribute-lastname"
                    label={t`User's last name attribute`}
                    hasCopyButton
                    {...getEnvNoticeProps(
                      settingDetails["saml-attribute-lastname"],
                    )}
                  />
                  {settingValues["use-tenants"] && (
                    <FormTextInput
                      name="saml-attribute-tenant"
                      label={t`Tenant assignment attribute`}
                      hasCopyButton
                      {...getEnvNoticeProps(
                        settingDetails["saml-attribute-tenant"],
                      )}
                    />
                  )}
                </Stack>
              </SettingsSection>

              <SettingsSection
                title={t`Identity provider info`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="saml-identity-provider-uri"
                    label={t`SAML identity provider URL`}
                    placeholder="https://your-org-name.yourIDP.com"
                    required
                    {...getExtraFormFieldProps(
                      settingDetails["saml-identity-provider-uri"],
                    )}
                  />
                  <FormTextarea
                    name="saml-identity-provider-certificate"
                    label={t`SAML identity provider certificate`}
                    placeholder="-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----"
                    required
                    {...getExtraFormFieldProps(
                      settingDetails["saml-identity-provider-certificate"],
                    )}
                  />
                  <FormTextInput
                    name="saml-application-name"
                    label={t`SAML application name`}
                    placeholder={getDefaultPlaceholder(
                      settingDetails["saml-application-name"],
                    )}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails["saml-application-name"],
                    )}
                  />
                  <FormTextInput
                    name="saml-identity-provider-issuer"
                    label={t`SAML identity provider issuer`}
                    description={t`This is a unique identifier for the IdP. Often referred to as Entity ID or simply 'Issuer'.`}
                    descriptionProps={SETTINGS_FIELD_DESCRIPTION_PROPS}
                    placeholder="http://www.example.com/141xkex604w0Q5PN724v"
                    required
                    {...getEnvNoticeProps(
                      settingDetails["saml-identity-provider-issuer"],
                    )}
                  />
                </Stack>
              </SettingsSection>

              <CollapsibleSettingsSection
                title={t`Sign SSO requests`}
                description={t`Use a keystore to sign authentication requests sent to your identity provider`}
                defaultOpened={hasKeystoreSettings}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="saml-keystore-path"
                    label={t`SAML keystore path`}
                    placeholder="/path/to/keystore.jks"
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails["saml-keystore-path"],
                    )}
                  />
                  <FormTextInput
                    name="saml-keystore-password"
                    label={t`SAML keystore password`}
                    type="password"
                    placeholder={t`Shh...`}
                    nullable
                    {...getEnvNoticeProps(
                      settingDetails["saml-keystore-password"],
                    )}
                  />
                  <FormTextInput
                    name="saml-keystore-alias"
                    label={t`SAML keystore alias`}
                    placeholder="saml"
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails["saml-keystore-alias"],
                    )}
                  />
                </Stack>
              </CollapsibleSettingsSection>

              {/* the card saves on its own, so it stays out of the form's values */}
              <UserProvisioningSection
                settingKey="saml-user-provisioning-enabled?"
                providerName="SAML"
                disabled={!isConfigured}
                lockedNote={scimNote}
              />

              <SettingsGroupMappingSection
                syncSettingKey="saml-group-sync"
                mappingsSettingKey="saml-group-mappings"
                description={t`Automatically assign people to ${applicationName} groups based on groups from your SAML identity provider`}
                nameLabel={t`SAML group name`}
                namePlaceholder={t`Enter SAML group...`}
                data-testid="saml-group-mapping-section"
                disabled={!isConfigured}
                onToggle={(enabled) => {
                  // the attribute field hides with the switch, so an unsaved edit must not ride along on the next save
                  if (!enabled) {
                    setFieldValue(
                      "saml-attribute-group",
                      initialValues["saml-attribute-group"],
                    );
                  }
                }}
              >
                <FormTextInput
                  name="saml-attribute-group"
                  label={t`Group attribute name`}
                  placeholder="member_of"
                  nullable
                  {...getExtraFormFieldProps(
                    settingDetails["saml-attribute-group"],
                  )}
                />
              </SettingsGroupMappingSection>

              <FormErrorMessage />
              <Flex justify="end">
                <FormSubmitButton
                  disabled={!dirty}
                  label={isEnabled ? t`Save changes` : t`Save and enable`}
                  variant="filled"
                />
              </Flex>
            </Stack>
            <LeaveRouteConfirmModal isEnabled={dirty && !isSubmitting} />
          </Form>
        )}
      </FormProvider>
    </SettingsPageWrapper>
  );
}

const getFormValues = (
  settingDetails: SettingDefinitionMap,
  settingValues: Partial<EnterpriseSettings>,
): SAMLFormSettings => {
  const samlSettings = _.pick(settingValues, [
    "saml-attribute-email",
    "saml-attribute-firstname",
    "saml-attribute-lastname",
    "saml-attribute-tenant",
    "saml-identity-provider-uri",
    "saml-identity-provider-issuer",
    "saml-identity-provider-certificate",
    "saml-keystore-password",
    "saml-keystore-alias",
    "saml-keystore-path",
    "saml-attribute-group",
  ]);

  // mapObject widens every value to one union, so the shape is narrowed back to the form's
  return {
    ..._.mapObject(samlSettings, (val) => val ?? null),
    "saml-application-name": getStoredFieldValue(
      settingDetails["saml-application-name"],
      settingValues["saml-application-name"],
    ),
  } as SAMLFormSettings;
};
