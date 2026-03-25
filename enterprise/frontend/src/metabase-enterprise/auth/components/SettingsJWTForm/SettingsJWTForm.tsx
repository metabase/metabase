import { t } from "ttag";
import _ from "underscore";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { GroupMappingsWidget } from "metabase/admin/settings/components/widgets/GroupMappingsWidget";
import { getExtraFormFieldProps } from "metabase/admin/settings/utils";
import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSecretKey,
  FormSection,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Flex, Stack } from "metabase/ui";
import { provisioningOptions } from "metabase-enterprise/auth/utils";
import type {
  EnterpriseSettings,
  SettingDefinitionMap,
} from "metabase-types/api";

export type JWTFormValues = Pick<
  EnterpriseSettings,
  | "jwt-user-provisioning-enabled?"
  | "jwt-identity-provider-uri"
  | "jwt-shared-secret"
  | "jwt-attribute-email"
  | "jwt-attribute-firstname"
  | "jwt-attribute-lastname"
>;

export const SettingsJWTForm = () => {
  const { data: settingDetails, isLoading: isLoadingDetails } =
    useGetAdminSettingsDetailsQuery();
  const { data: settingValues, isLoading: isLoadingValues } =
    useGetSettingsQuery();
  const { value: jwtEnabled, updateSettings } = useAdminSetting("jwt-enabled");

  const handleSubmit = async (values: Partial<JWTFormValues>) => {
    // jwt-shared-secret may be initialized with the obfuscated value from /api/setting.
    // Only send it to the backend if it's a newly generated plaintext value.
    const { "jwt-shared-secret": jwtSecret, ...rest } = values;
    const result = await updateSettings({
      ...rest,
      ...(jwtSecret != null && !isObfuscatedValue(jwtSecret)
        ? { "jwt-shared-secret": jwtSecret }
        : {}),
      "jwt-enabled": true,
      toast: false,
    });

    if (result.error) {
      throw new Error(t`Error saving JWT Settings`);
    }
  };

  if (isLoadingDetails || isLoadingValues) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!settingDetails || !settingValues) {
    return (
      <LoadingAndErrorWrapper error={t`Error loading JWT configuration`} />
    );
  }

  return (
    <SettingsPageWrapper title={t`JWT`}>
      {jwtEnabled && (
        <SettingsSection>
          <AdminSettingInput
            name="jwt-user-provisioning-enabled?"
            title={t`User provisioning`}
            inputType="radio"
            options={provisioningOptions("JWT")}
          />
        </SettingsSection>
      )}
      <SettingsSection>
        <FormProvider
          initialValues={getFormValues(settingValues, settingDetails)}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ dirty }) => (
            <Form>
              <FormSection title={"Server Settings"}>
                <Stack gap="lg">
                  <FormTextInput
                    name="jwt-identity-provider-uri"
                    label={t`JWT Identity Provider URI`}
                    required
                    placeholder="https://jwt.yourdomain.org"
                    autoFocus
                    {...getExtraFormFieldProps(
                      settingDetails?.["jwt-identity-provider-uri"],
                    )}
                  />
                  <FormSecretKey
                    name="jwt-shared-secret"
                    label={t`String used by the JWT signing key`}
                    required
                    {...getExtraFormFieldProps(
                      settingDetails?.["jwt-shared-secret"],
                    )}
                  />
                </Stack>
              </FormSection>
              <FormSection
                title={"User attribute configuration (optional)"}
                collapsible
              >
                <Stack gap="md">
                  <FormTextInput
                    name="jwt-attribute-email"
                    label={t`Email attribute`}
                    {...getExtraFormFieldProps(
                      settingDetails?.["jwt-attribute-email"],
                    )}
                  />
                  <FormTextInput
                    name="jwt-attribute-firstname"
                    label={t`First name attribute`}
                    {...getExtraFormFieldProps(
                      settingDetails?.["jwt-attribute-firstname"],
                    )}
                  />
                  <FormTextInput
                    name="jwt-attribute-lastname"
                    label={t`Last name attribute`}
                    {...getExtraFormFieldProps(
                      settingDetails?.["jwt-attribute-lastname"],
                    )}
                  />
                  <FormTextInput
                    name="jwt-attribute-groups"
                    label={t`Group assignment attribute`}
                    {...getExtraFormFieldProps(
                      settingDetails?.["jwt-attribute-groups"],
                    )}
                  />
                  {settingValues["use-tenants"] && (
                    <FormTextInput
                      name="jwt-attribute-tenant"
                      label={t`Tenant assignment attribute`}
                      {...getExtraFormFieldProps(
                        settingDetails?.["jwt-attribute-tenant"],
                      )}
                    />
                  )}
                </Stack>
              </FormSection>
              <FormSection title={"Group Sync"} data-testid="jwt-group-schema">
                <GroupMappingsWidget
                  setting={{ key: "jwt-group-sync" }}
                  onChange={handleSubmit}
                  settingValues={settingValues}
                  mappingSetting="jwt-group-mappings"
                  groupHeading={t`Group Name`}
                  groupPlaceholder={t`Group Name`}
                />
              </FormSection>
              <FormErrorMessage />
              <Flex justify="end">
                <FormSubmitButton
                  disabled={!dirty}
                  label={jwtEnabled ? t`Save changes` : t`Save and enable`}
                  variant="filled"
                />
              </Flex>
            </Form>
          )}
        </FormProvider>
      </SettingsSection>
    </SettingsPageWrapper>
  );
};

const getFormValues = (
  allSettings: EnterpriseSettings,
  settingDetails: SettingDefinitionMap,
): JWTFormValues => {
  const jwtSettings = _.pick(allSettings, [
    "jwt-user-provisioning-enabled?",
    "jwt-identity-provider-uri",
    "jwt-group-sync",
    "jwt-attribute-email",
    "jwt-attribute-firstname",
    "jwt-attribute-lastname",
    "jwt-attribute-groups",
    "jwt-attribute-tenant",
  ]);

  if (jwtSettings["jwt-user-provisioning-enabled?"] == null) {
    // cast empty to false
    jwtSettings["jwt-user-provisioning-enabled?"] = false;
  }

  // Read jwt-shared-secret from /api/setting (settingDetails) which already returns obfuscated
  // values for sensitive settings, so we never need to expose the plaintext in session-properties.
  const jwtSecretValue =
    (settingDetails["jwt-shared-secret"]?.value as string | null) ?? null;

  // cast undefined to null
  return {
    ...(_.mapObject(jwtSettings, (val) => val ?? null) as Omit<
      JWTFormValues,
      "jwt-shared-secret"
    >),
    "jwt-shared-secret": jwtSecretValue,
  };
};

const isObfuscatedValue = (value: string | null | undefined): boolean =>
  value != null && value.startsWith("**");
