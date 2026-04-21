import { t } from "ttag";
import _ from "underscore";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { GroupMappingsWidget } from "metabase/admin/settings/components/widgets/GroupMappingsWidget";
import { getExtraFormFieldProps } from "metabase/admin/settings/utils";
import { useGetAdminSettingsDetailsQuery } from "metabase/api";
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
  const {
    data: settingDetails,
    isLoading: isLoadingDetails,
    refetch: refetchSettingDetails,
  } = useGetAdminSettingsDetailsQuery();
  const { value: jwtEnabled, updateSettings } = useAdminSetting("jwt-enabled");

  const handleSubmit = async (values: Partial<JWTFormValues>) => {
    const { "jwt-shared-secret": jwtSecret, ...rest } = values;
    const settingsToUpdate: Partial<JWTFormValues> = { ...rest };

    // jwt-shared-secret may be initialized with the obfuscated value from /api/setting.
    // Only send it to the backend if it's a newly generated plaintext value.
    if (jwtSecret != null && !isObfuscatedValue(jwtSecret)) {
      settingsToUpdate["jwt-shared-secret"] = jwtSecret;
    }

    const result = await updateSettings({
      ...settingsToUpdate,
      "jwt-enabled": true,
      toast: false,
    });
    // Make sure the shared token obfuscated value is fetched from the backend.
    refetchSettingDetails();

    if (result.error) {
      throw new Error(t`Error saving JWT Settings`);
    }
  };

  if (isLoadingDetails) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!settingDetails) {
    return (
      <LoadingAndErrorWrapper error={t`Error loading JWT configuration`} />
    );
  }

  const usingTenants = settingDetails["use-tenants"]?.value;

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
          initialValues={getFormValues(settingDetails)}
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
                  {usingTenants && (
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

const getFormValues = (settingDetails: SettingDefinitionMap): JWTFormValues => {
  const jwtSettings = _.pick(settingDetails, [
    "jwt-user-provisioning-enabled?",
    "jwt-identity-provider-uri",
    "jwt-shared-secret",
    "jwt-group-sync",
    "jwt-attribute-email",
    "jwt-attribute-firstname",
    "jwt-attribute-lastname",
    "jwt-attribute-groups",
    "jwt-attribute-tenant",
  ]);

  if (!jwtSettings["jwt-user-provisioning-enabled?"]?.value) {
    // cast empty to false
    jwtSettings["jwt-user-provisioning-enabled?"] = {
      ...jwtSettings["jwt-user-provisioning-enabled?"],
      value: false,
    };
  }

  // cast undefined to null
  return _.mapObject(jwtSettings, (val) => val?.value ?? null) as JWTFormValues;
};

const isObfuscatedValue = (value: string | null | undefined): boolean =>
  !!value && value.startsWith("**");
