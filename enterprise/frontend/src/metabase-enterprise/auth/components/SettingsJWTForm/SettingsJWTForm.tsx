import { t } from "ttag";
import _ from "underscore";

import {
  CollapsibleSettingsSection,
  SETTINGS_CARD_DESCRIPTION_PROPS,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { GroupMappingsWidget } from "metabase/admin/settings/components/widgets/GroupMappingsWidget";
import { getExtraFormFieldProps } from "metabase/admin/settings/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSecretKey,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  useAdminSetting,
  useGetAdminSettingsDetailsQuery,
} from "metabase/settings";
import { Box, Flex, Stack } from "metabase/ui";
import { provisioningOptions } from "metabase-enterprise/auth/utils";
import type {
  EnterpriseSettings,
  SettingDefinition,
  SettingDefinitionMap,
} from "metabase-types/api";

// Attribute-key fields show only a placeholder, no helper text. Env-locked
// fields swap the placeholder for the readOnly "Using MB_..." notice.
const getAttributeFieldProps = (
  setting: SettingDefinition | undefined,
  placeholder?: string,
) => {
  if (setting?.is_env_setting) {
    return getExtraFormFieldProps(setting);
  }
  return { placeholder };
};

export type JWTFormValues = Pick<
  EnterpriseSettings,
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
  const applicationName = useSelector(getApplicationName);
  const [sendToast] = useToast();

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

    sendToast({ message: t`Changes saved`, icon: "check_filled" });
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
  const hasUserAttributes = [
    settingDetails["jwt-attribute-email"],
    settingDetails["jwt-attribute-firstname"],
    settingDetails["jwt-attribute-lastname"],
    settingDetails["jwt-attribute-groups"],
    ...(usingTenants ? [settingDetails["jwt-attribute-tenant"]] : []),
  ].some(
    // env-configured attributes come back with a nil value and only the
    // is_env_setting flag, so value alone can't detect them
    (setting) => Boolean(setting?.value) || (setting?.is_env_setting ?? false),
  );

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
      <FormProvider
        initialValues={getFormValues(settingDetails)}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="xl">
              <SettingsSection
                title={t`Server settings`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="xl">
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
              </SettingsSection>
              <CollapsibleSettingsSection
                title={t`User attribute configuration`}
                description={t`You can send additional user attributes to ${applicationName} by adding the attributes as key/value pairs to your JWT`}
                defaultOpened={hasUserAttributes}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="jwt-attribute-email"
                    label={t`Email attribute key`}
                    {...getAttributeFieldProps(
                      settingDetails?.["jwt-attribute-email"],
                      "email-key",
                    )}
                  />
                  <FormTextInput
                    name="jwt-attribute-firstname"
                    label={t`First name attribute key`}
                    {...getAttributeFieldProps(
                      settingDetails?.["jwt-attribute-firstname"],
                      "first-name-key",
                    )}
                  />
                  <FormTextInput
                    name="jwt-attribute-lastname"
                    label={t`Last name attribute key`}
                    {...getAttributeFieldProps(
                      settingDetails?.["jwt-attribute-lastname"],
                      "last-name-key",
                    )}
                  />
                  <FormTextInput
                    name="jwt-attribute-groups"
                    label={t`Group assignment attribute key`}
                    {...getAttributeFieldProps(
                      settingDetails?.["jwt-attribute-groups"],
                      "group-assignment-key",
                    )}
                  />
                  {usingTenants && (
                    <FormTextInput
                      name="jwt-attribute-tenant"
                      label={t`Tenant assignment attribute key`}
                      {...getAttributeFieldProps(
                        settingDetails?.["jwt-attribute-tenant"],
                      )}
                    />
                  )}
                </Stack>
              </CollapsibleSettingsSection>
              <SettingsSection
                title={t`Group mapping`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                description={t`Lets you assign users to custom ${applicationName} groups based on their JWT attributes`}
                descriptionProps={SETTINGS_CARD_DESCRIPTION_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Box data-testid="jwt-group-schema">
                  <GroupMappingsWidget
                    setting={{ key: "jwt-group-sync" }}
                    onChange={handleSubmit}
                    mappingSetting="jwt-group-mappings"
                    groupHeading={t`Group Name`}
                    groupPlaceholder={t`Group Name`}
                  />
                </Box>
              </SettingsSection>
              <FormErrorMessage />
              <Flex justify="end">
                <FormSubmitButton
                  disabled={!dirty}
                  label={jwtEnabled ? t`Save changes` : t`Save and enable`}
                  variant="filled"
                />
              </Flex>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </SettingsPageWrapper>
  );
};

const getFormValues = (settingDetails: SettingDefinitionMap): JWTFormValues => {
  const jwtSettings = _.pick(settingDetails, [
    "jwt-identity-provider-uri",
    "jwt-shared-secret",
    "jwt-group-sync",
    "jwt-attribute-email",
    "jwt-attribute-firstname",
    "jwt-attribute-lastname",
    "jwt-attribute-groups",
    "jwt-attribute-tenant",
  ]);

  // cast undefined to null
  return _.mapObject(jwtSettings, (val) => val?.value ?? null) as JWTFormValues;
};

const isObfuscatedValue = (value: string | null | undefined): boolean =>
  !!value && value.startsWith("**");
