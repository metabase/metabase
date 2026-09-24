import { useCallback, useMemo } from "react";
import { c, t } from "ttag";
import type { TestConfig } from "yup";
import * as Yup from "yup";

import { SettingsGroupMappingSection } from "metabase/admin/settings/auth/components/GroupMappings";
import {
  getDefaultPlaceholder,
  getExtraFormFieldProps,
  getStoredFieldValue,
} from "metabase/admin/settings/utils";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { PLUGIN_LDAP_FORM_FIELDS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/settings";
import {
  CollapsibleSettingsSection,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";
import { Box, Flex, Radio, Stack } from "metabase/ui";
import type {
  EnterpriseSettings,
  SettingDefinition,
  SettingDefinitionMap,
} from "metabase-types/api";

import { useUpdateLdapMutation } from "../api/ldap";

// the membership filter is hidden while group mapping is off, so its check must not block the page then
const getLdapSchema = (isGroupMappingOn: boolean) => {
  const parenthesesTest: TestConfig<string | null | undefined> = {
    name: "test-parentheses",
    message: t`Check your parentheses`,
    test: (value) =>
      (value?.match(/\(/g) || []).length === (value?.match(/\)/g) || []).length,
  };
  const portMessage = t`Port must be a whole number between 1 and 65535`;
  return Yup.object({
    "ldap-port": Yup.number()
      .integer(portMessage)
      .min(1, portMessage)
      .max(65535, portMessage)
      .nullable(),
    "ldap-user-filter": Yup.string().nullable().test(parenthesesTest),
    "ldap-group-membership-filter": isGroupMappingOn
      ? Yup.string().nullable().test(parenthesesTest)
      : Yup.string().nullable(),
  });
};

// an empty port means the default, so the form allows null where the setting does not
export type LdapFormValues = Omit<LdapSettingValues, "ldap-port"> & {
  "ldap-port": number | null;
};

type LdapSettingValues = Pick<
  EnterpriseSettings,
  | "ldap-host"
  | "ldap-port"
  | "ldap-security"
  | "ldap-bind-dn"
  | "ldap-password"
  | "ldap-user-base"
  | "ldap-user-filter"
  | "ldap-attribute-email"
  | "ldap-attribute-firstname"
  | "ldap-attribute-lastname"
  | "ldap-group-base"
  | "ldap-group-membership-filter"
>;

type LdapTextKey = Exclude<keyof LdapFormValues, "ldap-port" | "ldap-security">;

// the connection test needs a port spelled out, so an empty field falls back to the backend default
const FALLBACK_LDAP_PORT = 389;

const LDAP_ATTRIBUTE_KEYS = [
  "ldap-attribute-email",
  "ldap-attribute-firstname",
  "ldap-attribute-lastname",
] as const;

// the backend copy for a few fields predates the design, so the page supplies its own description
const withDescription = (
  setting: SettingDefinition | undefined,
  description: string,
) => {
  const fieldProps = getExtraFormFieldProps(setting);
  return setting?.is_env_setting ? fieldProps : { ...fieldProps, description };
};

const getAttributeFieldProps = (setting: SettingDefinition | undefined) =>
  setting?.is_env_setting
    ? getExtraFormFieldProps(setting)
    : { placeholder: getDefaultPlaceholder(setting) };

export const SettingsLdapForm = () => {
  const { data: settingDetails, isLoading: isLoadingDetails } =
    useGetAdminSettingsDetailsQuery();
  const { data: settingValues, isLoading: isLoadingValues } =
    useGetSettingsQuery();
  const [updateLdapSettings] = useUpdateLdapMutation();
  const applicationName = useSelector(getApplicationName);
  const isEnabled = settingValues?.["ldap-enabled"];
  const isConfigured = settingValues?.["ldap-configured?"] ?? false;
  const isGroupMappingOn = settingValues?.["ldap-group-sync"] ?? false;
  const schema = useMemo(
    () => getLdapSchema(isGroupMappingOn),
    [isGroupMappingOn],
  );
  const defaultPort =
    settingDetails?.["ldap-port"]?.default ?? FALLBACK_LDAP_PORT;

  const handleSubmit = useCallback(
    (values: LdapFormValues) => {
      return updateLdapSettings({
        ...values,
        "ldap-port": Number(values["ldap-port"] ?? defaultPort),
        "ldap-enabled": true,
      }).unwrap();
    },
    [updateLdapSettings, defaultPort],
  );

  if (isLoadingDetails || isLoadingValues) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!settingDetails || !settingValues) {
    return (
      <LoadingAndErrorWrapper error={t`Error loading LDAP configuration`} />
    );
  }

  const hasCustomAttributes = LDAP_ATTRIBUTE_KEYS.some((key) => {
    const setting = settingDetails[key];
    return setting?.value != null || (setting?.is_env_setting ?? false);
  });

  return (
    <SettingsPageWrapper title={t`LDAP`}>
      <FormProvider
        initialValues={getFormValues(settingDetails, settingValues)}
        onSubmit={handleSubmit}
        validationSchema={schema}
        enableReinitialize
      >
        {({ dirty, initialValues, isSubmitting, setFieldValue }) => (
          <Form>
            <Stack gap="xl">
              <SettingsSection
                title={t`Server settings`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="ldap-host"
                    label={t`LDAP host`}
                    placeholder="ldap.yourdomain.org"
                    required
                    autoFocus
                    {...getExtraFormFieldProps(settingDetails["ldap-host"])}
                  />
                  <FormTextInput
                    name="ldap-port"
                    label={t`LDAP port`}
                    placeholder={String(defaultPort)}
                    type="number"
                    nullable
                    {...getExtraFormFieldProps(settingDetails["ldap-port"])}
                  />
                  <FormRadioGroup
                    name="ldap-security"
                    label={t`LDAP security`}
                    {...getExtraFormFieldProps(settingDetails["ldap-security"])}
                    description={null}
                  >
                    <Stack mt="xxs" gap="sm">
                      <Radio value="none" label={t`None`} />
                      <Radio
                        value="ssl"
                        label={c("short for 'Secure Sockets Layer'").t`SSL`}
                      />
                      <Radio value="starttls" label={t`StartTLS`} />
                    </Stack>
                  </FormRadioGroup>
                  <FormTextInput
                    name="ldap-bind-dn"
                    label={t`Username or DN`}
                    placeholder="cn=admin,dc=company,dc=com"
                    nullable
                    {...getExtraFormFieldProps(settingDetails["ldap-bind-dn"])}
                  />
                  <FormTextInput
                    name="ldap-password"
                    label={t`Password`}
                    type="password"
                    placeholder={t`Shh...`}
                    nullable
                    {...getExtraFormFieldProps(settingDetails["ldap-password"])}
                  />
                </Stack>
              </SettingsSection>
              <SettingsSection
                title={t`User schema`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="ldap-user-base"
                    label={t`User search base`}
                    placeholder="ou=users,dc=example,dc=org"
                    required
                    {...withDescription(
                      settingDetails["ldap-user-base"],
                      t`The distinguished name (DN) of the entry in your LDAP server that ${applicationName} should use as the starting point when searching for users`,
                    )}
                  />
                  <FormTextInput
                    name="ldap-user-filter"
                    label={t`User filter`}
                    placeholder={getDefaultPlaceholder(
                      settingDetails["ldap-user-filter"],
                    )}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails["ldap-user-filter"],
                    )}
                  />
                </Stack>
              </SettingsSection>
              {/* the card saves on its own, so it stays out of the form's values */}
              <PLUGIN_LDAP_FORM_FIELDS.LdapUserProvisioning
                disabled={!isConfigured}
              />
              <CollapsibleSettingsSection
                title={t`Attributes`}
                description={t`Map LDAP attributes to the email, first name, and last name fields in ${applicationName}`}
                defaultOpened={hasCustomAttributes}
                disabled={!isConfigured}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="ldap-attribute-email"
                    label={t`Email attribute key`}
                    nullable
                    {...getAttributeFieldProps(
                      settingDetails["ldap-attribute-email"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-attribute-firstname"
                    label={t`First name attribute key`}
                    nullable
                    {...getAttributeFieldProps(
                      settingDetails["ldap-attribute-firstname"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-attribute-lastname"
                    label={t`Last name attribute key`}
                    nullable
                    {...getAttributeFieldProps(
                      settingDetails["ldap-attribute-lastname"],
                    )}
                  />
                </Stack>
              </CollapsibleSettingsSection>
              <SettingsGroupMappingSection
                syncSettingKey="ldap-group-sync"
                mappingsSettingKey="ldap-group-mappings"
                description={t`Automatically assign people to ${applicationName} groups based on their LDAP group membership`}
                // LDAP users are never tenants, so tenant groups stay out of the picker
                tenancy="internal"
                nameLabel={t`LDAP group name`}
                // mapping names are group DNs, which the backend validates on write
                namePlaceholder="cn=people,ou=groups,dc=example,dc=org"
                data-testid="ldap-group-mapping-section"
                disabled={!isConfigured}
                onToggle={(enabled) => {
                  // the group fields hide with the switch, so unsaved edits must not ride along on the next save
                  if (!enabled) {
                    setFieldValue(
                      "ldap-group-base",
                      initialValues["ldap-group-base"],
                    );
                    // the membership filter only exists on EE, so the key can be missing from the form
                    if ("ldap-group-membership-filter" in initialValues) {
                      setFieldValue(
                        "ldap-group-membership-filter",
                        initialValues["ldap-group-membership-filter"],
                      );
                    }
                  }
                }}
              >
                <FormTextInput
                  name="ldap-group-base"
                  label={t`Group search base`}
                  placeholder="ou=groups,dc=example,dc=org"
                  nullable
                  {...withDescription(
                    settingDetails["ldap-group-base"],
                    t`Not required for LDAP directories that provide a 'memberOf' overlay, such as Active Directory. It will be searched recursively.`,
                  )}
                />
                <PLUGIN_LDAP_FORM_FIELDS.LdapGroupMembershipFilter />
              </SettingsGroupMappingSection>
              <Flex justify="end" gap="md">
                <Box>
                  <FormErrorMessage />
                </Box>
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
};

export const getFormValues = (
  settingDetails: SettingDefinitionMap,
  settingValues: EnterpriseSettings,
): LdapFormValues => {
  const storedValue = (key: LdapTextKey): string | null =>
    getStoredFieldValue(settingDetails[key], settingValues[key]);

  const values: LdapFormValues = {
    "ldap-host": storedValue("ldap-host"),
    "ldap-port": getStoredFieldValue(
      settingDetails["ldap-port"],
      settingValues["ldap-port"],
    ),
    "ldap-security": settingValues["ldap-security"] ?? "none",
    "ldap-bind-dn": storedValue("ldap-bind-dn"),
    "ldap-password": storedValue("ldap-password"),
    "ldap-user-base": storedValue("ldap-user-base"),
    "ldap-user-filter": storedValue("ldap-user-filter"),
    "ldap-attribute-email": storedValue("ldap-attribute-email"),
    "ldap-attribute-firstname": storedValue("ldap-attribute-firstname"),
    "ldap-attribute-lastname": storedValue("ldap-attribute-lastname"),
    "ldap-group-base": storedValue("ldap-group-base"),
  };
  // OSS builds have no membership filter setting, so the key stays out of the write
  if (settingDetails["ldap-group-membership-filter"] != null) {
    values["ldap-group-membership-filter"] = storedValue(
      "ldap-group-membership-filter",
    );
  }
  return values;
};
