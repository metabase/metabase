import { useCallback } from "react";
import { c, t } from "ttag";
import _ from "underscore";
import type { TestConfig } from "yup";
import * as Yup from "yup";

import GroupMappingsWidget from "metabase/admin/settings/containers/GroupMappingsWidget";
import { getExtraFormFieldProps } from "metabase/admin/settings/utils";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
  useUpdateLdapMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSection,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { PLUGIN_LDAP_FORM_FIELDS } from "metabase/plugins";
import { Group, Radio, Stack, Title } from "metabase/ui";
import type { EnterpriseSettings, Settings } from "metabase-types/api";

import { SettingsSection } from "./SettingsSection";

const testParentheses: TestConfig<string | null | undefined> = {
  name: "test-parentheses",
  message: "Check your parentheses",
  test: (value) =>
    (value?.match(/\(/g) || []).length === (value?.match(/\)/g) || []).length,
};

const LDAP_SCHEMA = Yup.object({
  "ldap-port": Yup.number().integer().nullable(),
  "ldap-user-filter": Yup.string().nullable().test(testParentheses),
  "ldap-group-membership-filter": Yup.string().nullable().test(testParentheses),
});

export type LdapSettings = Pick<
  EnterpriseSettings,
  | "ldap-enabled"
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

export const SettingsLdapForm = () => {
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const { data: settingValues } = useGetSettingsQuery();
  const [updateLdapSettings] = useUpdateLdapMutation();
  const isEnabled = settingValues?.["ldap-enabled"];

  const handleSubmit = useCallback(
    (values: Partial<LdapSettings>) => {
      return updateLdapSettings({
        ...values,
        "ldap-port": Number(values["ldap-port"]),
        "ldap-enabled": true,
      }).unwrap();
    },
    [updateLdapSettings],
  );

  if (!settingValues) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <Stack>
      <Title order={1}>{t`LDAP`}</Title>
      <SettingsSection>
        <FormProvider
          initialValues={getFormValues(settingValues)}
          onSubmit={handleSubmit}
          validationSchema={LDAP_SCHEMA}
          enableReinitialize
        >
          {({ dirty }) => (
            <Form m="0 1rem" maw="32.5rem">
              <PLUGIN_LDAP_FORM_FIELDS.LdapUserProvisioning />
              <FormSection title={"Server Settings"}>
                <Stack gap="md">
                  <FormTextInput
                    name="ldap-host"
                    label={t`LDAP Host`}
                    placeholder="ldap.yourdomain.org"
                    required
                    autoFocus
                    {...getExtraFormFieldProps(settingDetails?.["ldap-host"])}
                  />
                  <FormTextInput
                    name="ldap-port"
                    label={t`LDAP Port`}
                    placeholder="389"
                    required
                    type="number"
                    {...getExtraFormFieldProps(settingDetails?.["ldap-port"])}
                  />
                  <FormRadioGroup
                    name="ldap-security"
                    label={t`LDAP Security`}
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-security"],
                    )}
                    description={null}
                  >
                    <Group mt={"xs"}>
                      <Radio value="none" label={t`None`} />
                      <Radio
                        value="ssl"
                        label={c("short for 'Secure Sockets Layer'").t`SSL`}
                      />
                      <Radio value="starttls" label={t`StartTLS`} />
                    </Group>
                  </FormRadioGroup>
                  <FormTextInput
                    name="ldap-bind-dn"
                    label={t`Username or DN`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-bind-dn"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-password"
                    label={t`Password`}
                    type="password"
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-password"],
                    )}
                  />
                </Stack>
              </FormSection>
              <FormSection title={"User Schema"}>
                <Stack gap="md">
                  <FormTextInput
                    name="ldap-user-base"
                    placeholder="ou=users,dc=example,dc=org"
                    label={t`User search base`}
                    required
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-user-base"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-user-filter"
                    label={t`User filter`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-user-filter"],
                    )}
                  />
                </Stack>
              </FormSection>
              <FormSection title={"Attributes"} collapsible>
                <Stack gap="md">
                  <FormTextInput
                    name="ldap-attribute-email"
                    label={t`Email attribute`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-attribute-email"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-attribute-firstname"
                    label={t`First name attribute`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-attribute-firstname"],
                    )}
                  />
                  <FormTextInput
                    name="ldap-attribute-lastname"
                    label={t`Last name attribute`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-attribute-lastname"],
                    )}
                  />
                </Stack>
              </FormSection>
              <FormSection title={"Group Schema"}>
                <Stack gap="md">
                  <GroupMappingsWidget
                    isFormik
                    setting={{ key: "ldap-group-sync" }}
                    onChange={handleSubmit}
                    settingValues={settingValues}
                    mappingSetting="ldap-group-mappings"
                    groupHeading={t`Group Name`}
                    groupPlaceholder={t`Group Name`}
                  />
                  <FormTextInput
                    name="ldap-group-base"
                    label={t`Group search base`}
                    nullable
                    {...getExtraFormFieldProps(
                      settingDetails?.["ldap-group-base"],
                    )}
                  />
                  <PLUGIN_LDAP_FORM_FIELDS.LdapGroupMembershipFilter />
                </Stack>
              </FormSection>
              <Stack align="start" gap="1rem" mb="1rem">
                <FormErrorMessage />
                <FormSubmitButton
                  disabled={!dirty}
                  label={isEnabled ? t`Save changes` : t`Save and enable`}
                  variant="filled"
                />
              </Stack>
            </Form>
          )}
        </FormProvider>
      </SettingsSection>
    </Stack>
  );
};

export const getFormValues = (allSettings: Partial<Settings>) => {
  const ldapSettings = _.pick(allSettings, [
    "ldap-host",
    "ldap-port",
    "ldap-security",
    "ldap-bind-dn",
    "ldap-password",
    "ldap-user-base",
    "ldap-user-filter",
    "ldap-attribute-email",
    "ldap-attribute-firstname",
    "ldap-attribute-lastname",
    "ldap-group-sync",
    "ldap-group-base",
    "ldap-group-membership-filter",
  ]);

  return ldapSettings;
};
