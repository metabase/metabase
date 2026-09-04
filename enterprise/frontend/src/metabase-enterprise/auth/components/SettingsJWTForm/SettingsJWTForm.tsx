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
import { getExtraFormFieldProps } from "metabase/admin/settings/utils";
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

import { JWTGroupMappingSection } from "./JWTGroupMappingSection";

/**
 * Attribute-key fields show only a placeholder, no helper text.
 * Env-locked fields swap the placeholder for the readOnly "Using MB_..." notice.
 */
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
  | "jwt-attribute-groups"
  | "jwt-attribute-tenant"
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

  // a paused JWT keeps its settings, so "configured" means an identity provider URI exists
  const uriSetting = settingDetails?.["jwt-identity-provider-uri"];
  const isServerConfigured =
    Boolean(uriSetting?.value) || (uriSetting?.is_env_setting ?? false);

  // either env var locks the whole group mapping section, since the two settings act as one feature
  const groupMappingEnvNames = [
    settingDetails?.["jwt-group-sync"],
    settingDetails?.["jwt-group-mappings"],
  ].flatMap((setting) =>
    setting?.is_env_setting && setting.env_name ? [setting.env_name] : [],
  );
  const isGroupMappingEnvConfigured = groupMappingEnvNames.length > 0;

  const saveSettings = async (values: JWTFormValues) => {
    const { "jwt-shared-secret": jwtSecret, ...rest } = values;
    const settingsToUpdate: Partial<EnterpriseSettings> = { ...rest };

    // jwt-shared-secret may be initialized with the obfuscated value from /api/setting.
    // Only send it to the backend if it's a newly generated plaintext value.
    if (jwtSecret != null && !isObfuscatedValue(jwtSecret)) {
      settingsToUpdate["jwt-shared-secret"] = jwtSecret;
    }

    // per the design, the first save turns automatic group mapping on; the section owns it from then on
    if (!isServerConfigured && !isGroupMappingEnvConfigured) {
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
    // env-configured attributes come back as nil with only the is_env_setting flag set
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
        onSubmit={saveSettings}
        enableReinitialize
      >
        {({ dirty, isSubmitting }) => (
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
                disabled={!isServerConfigured}
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

const getFormValues = (settingDetails: SettingDefinitionMap): JWTFormValues => {
  const jwtSettings = _.pick(settingDetails, [
    "jwt-identity-provider-uri",
    "jwt-shared-secret",
    "jwt-attribute-email",
    "jwt-attribute-firstname",
    "jwt-attribute-lastname",
    "jwt-attribute-groups",
    "jwt-attribute-tenant",
  ]);
  // mapObject widens the picked setting values (and casts undefined to null)
  return _.mapObject(jwtSettings, (val) => val?.value ?? null) as JWTFormValues;
};

const isObfuscatedValue = (value: string | null | undefined): boolean =>
  !!value && value.startsWith("**");
