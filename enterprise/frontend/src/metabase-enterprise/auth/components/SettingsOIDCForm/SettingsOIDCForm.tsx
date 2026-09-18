import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { SETTINGS_FIELD_DESCRIPTION_PROPS } from "metabase/admin/settings/utils";
import { getErrorMessage } from "metabase/api/utils/errors";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useGetAdminSettingsDetailsQuery, useSetting } from "metabase/settings";
import {
  CollapsibleSettingsSection,
  SETTINGS_CARD_STACK_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components";
import { Button, Flex, Stack } from "metabase/ui";
import {
  type CustomOidcConfig,
  type OidcCheckRequest,
  useCheckOidcConnectionMutation,
  useCreateCustomOidcMutation,
  useGetCustomOidcProvidersQuery,
  useUpdateCustomOidcMutation,
} from "metabase-enterprise/api";
import { UserProvisioningSection } from "metabase-enterprise/auth/components/UserProvisioningSection";

import {
  OidcGroupMappingSection,
  useGroupSyncWriter,
} from "./OidcGroupMappingSection";
import {
  DEFAULT_EMAIL_ATTRIBUTE,
  DEFAULT_FIRST_NAME_ATTRIBUTE,
  DEFAULT_GROUP_ATTRIBUTE,
  DEFAULT_LAST_NAME_ATTRIBUTE,
  DEFAULT_SCOPES,
} from "./constants";

type OidcGroupSync = NonNullable<CustomOidcConfig["group-sync"]>;

function getOidcFormSchema() {
  return Yup.object({
    "login-prompt": Yup.string().required(t`Login prompt is required`),
    key: Yup.string()
      .required(t`Key is required`)
      .matches(
        /^[a-z0-9][a-z0-9-]*$/,
        t`Must be lowercase letters, numbers, and hyphens only`,
      ),
    "issuer-uri": Yup.string().required(t`Issuer URI is required`),
    "client-id": Yup.string().required(t`Client ID is required`),
    "client-secret": Yup.string().nullable().default(null),
    scopes: Yup.string().nullable().default(null),
    "attribute-email": Yup.string().nullable().default(null),
    "attribute-firstname": Yup.string().nullable().default(null),
    "attribute-lastname": Yup.string().nullable().default(null),
    "group-attribute": Yup.string().nullable().default(null),
  });
}

interface OIDCFormValues {
  "login-prompt": string;
  key: string;
  "issuer-uri": string;
  "client-id": string;
  "client-secret": string | null;
  scopes: string | null;
  "attribute-email": string | null;
  "attribute-firstname": string | null;
  "attribute-lastname": string | null;
  "group-attribute": string | null;
}

// a stored value equal to the default reads as unset, so the default can show as the placeholder
const withoutDefault = (
  value: string | undefined,
  defaultValue: string,
): string | null => (value == null || value === defaultValue ? null : value);

function providerToFormValues(
  provider: CustomOidcConfig | null,
): OIDCFormValues {
  if (!provider) {
    return {
      "login-prompt": "",
      key: "",
      "issuer-uri": "",
      "client-id": "",
      "client-secret": null,
      scopes: null,
      "attribute-email": null,
      "attribute-firstname": null,
      "attribute-lastname": null,
      "group-attribute": null,
    };
  }

  const attributeMap = provider["attribute-map"] ?? {};

  return {
    "login-prompt": provider["login-prompt"] ?? "",
    key: provider.key ?? "",
    "issuer-uri": provider["issuer-uri"] ?? "",
    "client-id": provider["client-id"] ?? "",
    "client-secret": null,
    scopes: withoutDefault(
      provider.scopes?.join(", "),
      DEFAULT_SCOPES.join(", "),
    ),
    "attribute-email": withoutDefault(
      attributeMap["email"],
      DEFAULT_EMAIL_ATTRIBUTE,
    ),
    "attribute-firstname": withoutDefault(
      attributeMap["first_name"],
      DEFAULT_FIRST_NAME_ATTRIBUTE,
    ),
    "attribute-lastname": withoutDefault(
      attributeMap["last_name"],
      DEFAULT_LAST_NAME_ATTRIBUTE,
    ),
    "group-attribute": withoutDefault(
      provider["group-sync"]?.["group-attribute"],
      DEFAULT_GROUP_ATTRIBUTE,
    ),
  };
}

function formValuesToProvider(
  values: OIDCFormValues,
  groupSync: OidcGroupSync | undefined,
): Partial<CustomOidcConfig> {
  const scopes = values.scopes
    ? values.scopes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_SCOPES;

  const attributeMap: Record<string, string> = {};
  if (values["attribute-email"]) {
    attributeMap["email"] = values["attribute-email"];
  }
  if (values["attribute-firstname"]) {
    attributeMap["first_name"] = values["attribute-firstname"];
  }
  if (values["attribute-lastname"]) {
    attributeMap["last_name"] = values["attribute-lastname"];
  }

  const provider: Partial<CustomOidcConfig> = {
    key: values.key,
    "login-prompt": values["login-prompt"],
    "issuer-uri": values["issuer-uri"],
    "client-id": values["client-id"],
    scopes,
    enabled: true,
    "attribute-map": attributeMap,
    // the switch and the mappings save on their own, so the form carries their latest saved state next to the attribute
    "group-sync": {
      enabled: groupSync?.enabled ?? false,
      "group-attribute": values["group-attribute"] ?? DEFAULT_GROUP_ATTRIBUTE,
      "group-mappings": groupSync?.["group-mappings"] ?? {},
    },
  };

  if (values["client-secret"]) {
    provider["client-secret"] = values["client-secret"];
  }

  return provider;
}

export function SettingsOIDCForm() {
  const applicationName = useSelector(getApplicationName);
  const siteUrl = useSetting("site-url");
  const { data: settingDetails, isLoading: isLoadingDetails } =
    useGetAdminSettingsDetailsQuery();
  const { data: providers, isLoading: isLoadingProviders } =
    useGetCustomOidcProvidersQuery();
  const [createProvider] = useCreateCustomOidcMutation();
  const [updateProvider] = useUpdateCustomOidcMutation();
  const [checkConnection, { isLoading: isChecking }] =
    useCheckOidcConnectionMutation();
  const [sendToast] = useToast();
  // the card writes the same provider as the form, so the page owns the writer and can see when it is busy
  const groupSyncWriter = useGroupSyncWriter();

  const existingProvider =
    providers && providers.length > 0 ? providers[0] : null;
  // the cards below the server settings stay read-only until it is saved
  const isConfigured = existingProvider != null;
  const providersSetting = settingDetails?.["oidc-providers"];
  // the env var holds every provider, so it locks the whole page rather than one field
  const lockedEnvName = providersSetting?.is_env_setting
    ? providersSetting.env_name
    : undefined;
  const isLocked = lockedEnvName != null;
  const isEnabled = existingProvider?.enabled ?? false;

  const initialValues = useMemo(
    () => providerToFormValues(existingProvider),
    [existingProvider],
  );
  // the card opens by itself once a claim was customized
  const hasCustomAttributes = [
    initialValues["attribute-email"],
    initialValues["attribute-firstname"],
    initialValues["attribute-lastname"],
  ].some((value) => value != null);

  const runCheck = useCallback(
    async (values: OIDCFormValues) => {
      const req: OidcCheckRequest = {
        "issuer-uri": values["issuer-uri"],
        "client-id": values["client-id"],
      };
      if (values["client-secret"]) {
        req["client-secret"] = values["client-secret"];
      } else if (existingProvider) {
        req.key = existingProvider.key;
      }
      return await checkConnection(req).unwrap();
    },
    [checkConnection, existingProvider],
  );

  const handleCheckConnection = useCallback(
    async (values: OIDCFormValues) => {
      try {
        const result = await runCheck(values);
        if (result.credentials?.verified === false) {
          sendToast({
            message: t`OIDC discovery succeeded, but credentials could not be verified. The identity provider does not support the grant type used for testing.`,
            icon: "warning",
          });
        } else {
          sendToast({
            message: t`OIDC connection is valid`,
            icon: "check",
          });
        }
      } catch (error) {
        sendToast({
          message: getErrorMessage(error, t`OIDC configuration check failed`),
          icon: "warning",
        });
      }
    },
    [runCheck, sendToast],
  );

  const handleSubmit = useCallback(
    async (values: OIDCFormValues) => {
      // the connection check runs before saving and throws on failure
      await runCheck(values);

      // the card and the save button hold each other, so no card write can be in flight here
      const providerData = formValuesToProvider(
        values,
        existingProvider?.["group-sync"],
      );

      if (existingProvider) {
        const { key: _key, ...updateData } = providerData;
        await updateProvider({
          key: existingProvider.key,
          provider: updateData,
        }).unwrap();
      } else {
        // Unjustified type cast. FIXME
        await createProvider(providerData as CustomOidcConfig).unwrap();
      }
    },
    [existingProvider, createProvider, updateProvider, runCheck],
  );

  if (isLoadingDetails || isLoadingProviders) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (settingDetails == null || providers == null) {
    return (
      <LoadingAndErrorWrapper error={t`Error loading OIDC configuration`} />
    );
  }

  return (
    <SettingsPageWrapper title={t`OpenID Connect`}>
      <FormProvider
        initialValues={initialValues}
        onSubmit={handleSubmit}
        validationSchema={getOidcFormSchema()}
        enableReinitialize
      >
        {({ dirty, values, initialValues, isSubmitting, setFieldValue }) => (
          <Form>
            <Stack gap="xl">
              {lockedEnvName != null && <SetByEnvVar varName={lockedEnvName} />}
              <SettingsSection
                title={t`Server settings`}
                titleProps={SETTINGS_CARD_TITLE_PROPS}
                stackProps={SETTINGS_CARD_STACK_PROPS}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="key"
                    label={t`Key`}
                    description={t`Provider identifier. Your OIDC redirect URI will be "${siteUrl}/auth/sso/${values.key || "{key}"}/callback"`}
                    descriptionProps={SETTINGS_FIELD_DESCRIPTION_PROPS}
                    placeholder="okta"
                    required
                    disabled={existingProvider != null}
                    readOnly={isLocked}
                  />
                  <FormTextInput
                    name="login-prompt"
                    label={t`Login prompt`}
                    description={t`Button text on the ${applicationName} sign-in screen`}
                    descriptionProps={SETTINGS_FIELD_DESCRIPTION_PROPS}
                    placeholder={t`Sign in with Okta`}
                    required
                    readOnly={isLocked}
                  />
                  <FormTextInput
                    name="issuer-uri"
                    label={t`Issuer URI`}
                    description={t`The discovery endpoint "${(values["issuer-uri"] || "{url}").replace(/\/+$/, "")}/.well-known/openid-configuration" should be accessible`}
                    descriptionProps={SETTINGS_FIELD_DESCRIPTION_PROPS}
                    placeholder="https://your-idp.example.com"
                    required
                    readOnly={isLocked}
                  />
                  <FormTextInput
                    name="client-id"
                    label={t`Client ID`}
                    description={t`This is configured for ${applicationName} in your OIDC provider`}
                    descriptionProps={SETTINGS_FIELD_DESCRIPTION_PROPS}
                    placeholder="metabase-client-id"
                    required
                    readOnly={isLocked}
                  />
                  <FormTextInput
                    name="client-secret"
                    label={t`Client secret`}
                    description={t`This is configured in your OIDC provider`}
                    descriptionProps={SETTINGS_FIELD_DESCRIPTION_PROPS}
                    type="password"
                    placeholder={
                      existingProvider
                        ? t`Leave blank to keep current value`
                        : "your-client-secret"
                    }
                    readOnly={isLocked}
                  />
                  <FormTextInput
                    name="scopes"
                    label={t`Scopes`}
                    description={t`Comma-separated list of OIDC scopes to request`}
                    descriptionProps={SETTINGS_FIELD_DESCRIPTION_PROPS}
                    placeholder={DEFAULT_SCOPES.join(", ")}
                    nullable
                    readOnly={isLocked}
                  />
                </Stack>
              </SettingsSection>

              {/* the card saves on its own, so it stays out of the form's values */}
              <UserProvisioningSection
                settingKey="oidc-user-provisioning-enabled?"
                providerName="OIDC"
                disabled={!isConfigured}
              />

              <CollapsibleSettingsSection
                title={t`Attributes`}
                description={t`Map OIDC claims to user attributes. Use standard OIDC claim names or your provider's custom claims.`}
                defaultOpened={hasCustomAttributes}
                disabled={!isConfigured}
              >
                <Stack gap="lg">
                  <FormTextInput
                    name="attribute-email"
                    label={t`Email attribute key`}
                    placeholder={DEFAULT_EMAIL_ATTRIBUTE}
                    nullable
                    readOnly={isLocked}
                  />
                  <FormTextInput
                    name="attribute-firstname"
                    label={t`First name attribute key`}
                    placeholder={DEFAULT_FIRST_NAME_ATTRIBUTE}
                    nullable
                    readOnly={isLocked}
                  />
                  <FormTextInput
                    name="attribute-lastname"
                    label={t`Last name attribute key`}
                    placeholder={DEFAULT_LAST_NAME_ATTRIBUTE}
                    nullable
                    readOnly={isLocked}
                  />
                </Stack>
              </CollapsibleSettingsSection>

              <OidcGroupMappingSection
                provider={existingProvider}
                writer={groupSyncWriter}
                lockedEnvName={lockedEnvName}
                isPageSaving={isSubmitting}
                data-testid="oidc-group-mapping-section"
                onToggle={(enabled) => {
                  // the attribute field hides with the switch, so an unsaved edit must not ride along on the next save
                  if (!enabled) {
                    setFieldValue(
                      "group-attribute",
                      initialValues["group-attribute"],
                    );
                  }
                }}
              >
                <FormTextInput
                  name="group-attribute"
                  label={t`Group attribute name`}
                  description={t`The OIDC claim that contains group membership information.`}
                  descriptionProps={SETTINGS_FIELD_DESCRIPTION_PROPS}
                  placeholder={DEFAULT_GROUP_ATTRIBUTE}
                  nullable
                  readOnly={isLocked}
                />
              </OidcGroupMappingSection>

              <FormErrorMessage />
              <Flex gap="lg" wrap="wrap" justify="end">
                <Button
                  variant="outline"
                  loading={isChecking}
                  disabled={!values["issuer-uri"] || !values["client-id"]}
                  onClick={() => handleCheckConnection(values)}
                >
                  {t`Check connection`}
                </Button>
                {!isLocked && (
                  <FormSubmitButton
                    // a card write still in flight would be overwritten by this save
                    disabled={!dirty || groupSyncWriter.isSaving}
                    label={
                      existingProvider && isEnabled
                        ? t`Save changes`
                        : t`Save and enable`
                    }
                    variant="filled"
                  />
                )}
              </Flex>
            </Stack>
            <LeaveRouteConfirmModal isEnabled={dirty && !isSubmitting} />
          </Form>
        )}
      </FormProvider>
    </SettingsPageWrapper>
  );
}
