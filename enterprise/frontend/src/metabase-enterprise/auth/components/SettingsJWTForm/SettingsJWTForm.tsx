import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import {
  getDefaultPlaceholder,
  getExtraFormFieldProps,
  getStoredFieldValue,
} from "metabase/admin/settings/utils";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
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
import type { SettingsJWTFormProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  useAdminSetting,
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
} from "metabase/settings";
import {
  CollapsibleSettingsSection,
  SETTINGS_CARD_DESCRIPTION_PROPS,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";
import { Box, Flex, Stack } from "metabase/ui";
import { UserProvisioningSection } from "metabase-enterprise/auth/components/UserProvisioningSection";
import type {
  EnterpriseSettings,
  SettingDefinition,
  SettingDefinitionMap,
} from "metabase-types/api";

import { JWTGroupMappingSection } from "./JWTGroupMappingSection";

/**
 * Attribute-key fields show the backend default as a placeholder, no helper text.
 * Env-locked fields swap the placeholder for the readOnly "Using MB_..." notice.
 */
const getAttributeFieldProps = (setting: SettingDefinition | undefined) =>
  setting?.is_env_setting
    ? getExtraFormFieldProps(setting)
    : { placeholder: getDefaultPlaceholder(setting) };

export type JWTFormValues = Pick<
  EnterpriseSettings,
  | "jwt-identity-provider-uri"
  | "jwt-shared-secret"
  | "jwt-attribute-email"
  | "jwt-attribute-firstname"
  | "jwt-attribute-lastname"
  | "jwt-attribute-groups"
  | "jwt-attribute-tenant"
>;

type JWTTextKey = Exclude<keyof JWTFormValues, "jwt-shared-secret">;

const JWT_TEXT_KEYS = [
  "jwt-identity-provider-uri",
  "jwt-attribute-email",
  "jwt-attribute-firstname",
  "jwt-attribute-lastname",
  "jwt-attribute-groups",
  "jwt-attribute-tenant",
] satisfies JWTTextKey[];

export const SettingsJWTForm = ({
  title = t`JWT`,
}: SettingsJWTFormProps = {}) => {
  const {
    data: settingDetails,
    isLoading: isLoadingDetails,
    refetch: refetchSettingDetails,
  } = useGetAdminSettingsDetailsQuery();
  const { data: settingValues, isLoading: isLoadingValues } =
    useGetSettingsQuery();
  const { value: jwtEnabled, updateSettings } = useAdminSetting("jwt-enabled");
  const applicationName = useSelector(getApplicationName);
  const [sendToast] = useToast();

  const isServerConfigured = settingValues?.["jwt-configured"] ?? false;
  // a saved URI or mapping means the setup is not new, even if the shared secret went missing since
  const uriSetting = settingDetails?.["jwt-identity-provider-uri"];
  const hasSavedUri =
    Boolean(uriSetting?.value) || (uriSetting?.is_env_setting ?? false);
  const hasMappings =
    Object.keys(settingValues?.["jwt-group-mappings"] ?? {}).length > 0;
  const isNewSetup = !hasSavedUri && !hasMappings;

  // either env var locks the whole group mapping section, since the two settings act as one feature
  const groupMappingEnvNames = [
    settingDetails?.["jwt-group-sync"],
    settingDetails?.["jwt-group-mappings"],
  ].flatMap((setting) =>
    setting?.is_env_setting && setting.env_name ? [setting.env_name] : [],
  );
  const isGroupMappingEnvConfigured = groupMappingEnvNames.length > 0;
  const turnsOnGroupMapping = isNewSetup && !isGroupMappingEnvConfigured;

  const saveSettings = async (values: JWTFormValues) => {
    const { "jwt-shared-secret": jwtSecret, ...rest } = values;
    const envLockedKeys = JWT_TEXT_KEYS.filter(
      (key) => settingDetails?.[key]?.is_env_setting,
    );
    const settingsToUpdate: Partial<EnterpriseSettings> = _.omit(
      rest,
      envLockedKeys,
    );

    // jwt-shared-secret may be initialized with the obfuscated value from /api/setting.
    // Only send it to the backend if it's a newly generated plaintext value.
    if (jwtSecret != null && !isObfuscatedValue(jwtSecret)) {
      settingsToUpdate["jwt-shared-secret"] = jwtSecret;
    }

    if (turnsOnGroupMapping) {
      settingsToUpdate["jwt-group-sync"] = true;
      settingsToUpdate["jwt-group-mappings"] = {};
    }

    const result = await updateSettings({
      ...settingsToUpdate,
      "jwt-enabled": true,
      toast: false,
    });
    // Make sure the shared token obfuscated value is fetched from the backend.
    await refetchSettingDetails();

    if (result.error) {
      throw new Error(t`Error saving JWT Settings`);
    }

    sendToast({
      message: turnsOnGroupMapping
        ? t`Changes saved. Group mapping is set to Automatic.`
        : t`Changes saved`,
      icon: "check_filled",
    });
  };

  if (isLoadingDetails || isLoadingValues) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!settingDetails || !settingValues) {
    return (
      <LoadingAndErrorWrapper error={t`Error loading JWT configuration`} />
    );
  }

  const isSigningKeyEnvSet =
    settingDetails["jwt-shared-secret"]?.is_env_setting ?? false;
  const validationSchema = Yup.object({
    "jwt-shared-secret": Yup.string()
      .nullable()
      .when("jwt-identity-provider-uri", {
        is: (uri: string | null) => Boolean(uri) && !isSigningKeyEnvSet,
        then: (schema) =>
          schema.required(t`Set up a signing key before saving`),
      }),
  });
  const usingTenants = settingDetails["use-tenants"]?.value;
  const hasUserAttributes = [
    settingDetails["jwt-attribute-email"],
    settingDetails["jwt-attribute-firstname"],
    settingDetails["jwt-attribute-lastname"],
    settingDetails["jwt-attribute-groups"],
    ...(usingTenants ? [settingDetails["jwt-attribute-tenant"]] : []),
  ].some(
    // env-configured attributes come back as nil with only the is_env_setting flag set
    (setting) => Boolean(setting?.value) || (setting?.is_env_setting ?? false),
  );

  return (
    <SettingsPageWrapper title={title}>
      <FormProvider
        initialValues={getFormValues(settingDetails, settingValues)}
        onSubmit={saveSettings}
        validationSchema={validationSchema}
        enableReinitialize
      >
        {({ dirty, isSubmitting }) => (
          <Form>
            <Stack gap="xl">
              <UserProvisioningSection
                settingKey="jwt-user-provisioning-enabled?"
                providerName="JWT"
                reactivatesAccounts
              />
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
                disabled={!isServerConfigured}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="jwt-attribute-email"
                    label={t`Email attribute key`}
                    {...getAttributeFieldProps(
                      settingDetails?.["jwt-attribute-email"],
                    )}
                  />
                  <FormTextInput
                    name="jwt-attribute-firstname"
                    label={t`First name attribute key`}
                    {...getAttributeFieldProps(
                      settingDetails?.["jwt-attribute-firstname"],
                    )}
                  />
                  <FormTextInput
                    name="jwt-attribute-lastname"
                    label={t`Last name attribute key`}
                    {...getAttributeFieldProps(
                      settingDetails?.["jwt-attribute-lastname"],
                    )}
                  />
                  <FormTextInput
                    name="jwt-attribute-groups"
                    label={t`Group assignment attribute key`}
                    {...getAttributeFieldProps(
                      settingDetails?.["jwt-attribute-groups"],
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
                disabled={!isServerConfigured}
              >
                {/* the section saves on its own, so it stays out of the form's values */}
                <Box data-testid="jwt-group-schema">
                  <JWTGroupMappingSection
                    isServerConfigured={isServerConfigured}
                    lockedEnvNames={groupMappingEnvNames}
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
            <LeaveRouteConfirmModal isEnabled={dirty && !isSubmitting} />
          </Form>
        )}
      </FormProvider>
    </SettingsPageWrapper>
  );
};

const getFormValues = (
  settingDetails: SettingDefinitionMap,
  settingValues: EnterpriseSettings,
): JWTFormValues => {
  const storedValue = (key: JWTTextKey): string | null =>
    getStoredFieldValue(settingDetails[key], settingValues[key]);

  return {
    "jwt-identity-provider-uri": storedValue("jwt-identity-provider-uri"),
    // sensitive, so only the admin settings list carries it, obfuscated
    "jwt-shared-secret": settingDetails["jwt-shared-secret"]?.value ?? null,
    "jwt-attribute-email": storedValue("jwt-attribute-email"),
    "jwt-attribute-firstname": storedValue("jwt-attribute-firstname"),
    "jwt-attribute-lastname": storedValue("jwt-attribute-lastname"),
    "jwt-attribute-groups": storedValue("jwt-attribute-groups"),
    "jwt-attribute-tenant": storedValue("jwt-attribute-tenant"),
  };
};

const isObfuscatedValue = (value: string | null | undefined): boolean =>
  !!value && value.startsWith("**");
