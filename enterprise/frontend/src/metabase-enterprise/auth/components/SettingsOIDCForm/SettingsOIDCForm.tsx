import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSection,
  FormSubmitButton,
  FormSwitch,
  FormTextInput,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Flex, Stack, Text } from "metabase/ui";
import {
  type CustomOidcConfig,
  type OidcCheckRequest,
  useCheckOidcConnectionMutation,
  useCreateCustomOidcMutation,
  useDeleteCustomOidcMutation,
  useGetCustomOidcProvidersQuery,
  useUpdateCustomOidcMutation,
} from "metabase-enterprise/api";

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
    scopes: Yup.string().nullable().default("openid, email, profile"),
    "icon-url": Yup.string().nullable().default(null),
    "button-color": Yup.string().nullable().default(null),
    "attribute-email": Yup.string().nullable().default("email"),
    "attribute-firstname": Yup.string().nullable().default("given_name"),
    "attribute-lastname": Yup.string().nullable().default("family_name"),
    "auto-provision": Yup.boolean().default(true),
  });
}

interface OIDCFormValues {
  "login-prompt": string;
  key: string;
  "issuer-uri": string;
  "client-id": string;
  "client-secret": string | null;
  scopes: string | null;
  "icon-url": string | null;
  "button-color": string | null;
  "attribute-email": string | null;
  "attribute-firstname": string | null;
  "attribute-lastname": string | null;
  "auto-provision": boolean;
}

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
      scopes: "openid, email, profile",
      "icon-url": null,
      "button-color": null,
      "attribute-email": "email",
      "attribute-firstname": "given_name",
      "attribute-lastname": "family_name",
      "auto-provision": true,
    };
  }

  const attributeMap = provider["attribute-map"] ?? {};

  return {
    "login-prompt": provider["login-prompt"] ?? "",
    key: provider.key ?? "",
    "issuer-uri": provider["issuer-uri"] ?? "",
    "client-id": provider["client-id"] ?? "",
    "client-secret": null,
    scopes: (provider.scopes ?? ["openid", "email", "profile"]).join(", "),
    "icon-url": provider["icon-url"] ?? null,
    "button-color": provider["button-color"] ?? null,
    "attribute-email": attributeMap["email"] ?? "email",
    "attribute-firstname": attributeMap["first_name"] ?? "given_name",
    "attribute-lastname": attributeMap["last_name"] ?? "family_name",
    "auto-provision": provider["auto-provision"] ?? true,
  };
}

function formValuesToProvider(
  values: OIDCFormValues,
): Partial<CustomOidcConfig> {
  const scopes = values.scopes
    ? values.scopes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : ["openid", "email", "profile"];

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
    "auto-provision": values["auto-provision"],
    "attribute-map": attributeMap,
    "icon-url": values["icon-url"] || null,
    "button-color": values["button-color"] || null,
  };

  if (values["client-secret"]) {
    provider["client-secret"] = values["client-secret"];
  }

  return provider;
}

function getCheckErrorMessage(error: unknown): string {
  if (error != null && typeof error === "object" && "data" in error) {
    const { data } = error;
    if (typeof data === "string") {
      return data;
    }
    if (
      data != null &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
    ) {
      return (data as { message: string }).message;
    }
  }
  return t`OIDC configuration check failed`;
}

export function SettingsOIDCForm() {
  const applicationName = useSelector(getApplicationName);
  const { data: providers, isLoading } = useGetCustomOidcProvidersQuery();
  const [createProvider] = useCreateCustomOidcMutation();
  const [updateProvider] = useUpdateCustomOidcMutation();
  const [deleteProvider] = useDeleteCustomOidcMutation();
  const [checkConnection, { isLoading: isChecking }] =
    useCheckOidcConnectionMutation();
  const [sendToast] = useToast();

  const existingProvider =
    providers && providers.length > 0 ? providers[0] : null;
  const isExisting = existingProvider !== null;

  const initialValues = useMemo(
    () => providerToFormValues(existingProvider),
    [existingProvider],
  );

  const runCheck = useCallback(
    async (values: OIDCFormValues) => {
      const req: OidcCheckRequest = {
        "issuer-uri": values["issuer-uri"],
        "client-id": values["client-id"],
      };
      if (values["client-secret"]) {
        req["client-secret"] = values["client-secret"];
      } else if (isExisting && existingProvider) {
        req.key = existingProvider.key;
      }
      return await checkConnection(req).unwrap();
    },
    [checkConnection, isExisting, existingProvider],
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
          message: getCheckErrorMessage(error),
          icon: "warning",
        });
      }
    },
    [runCheck, sendToast],
  );

  const handleSubmit = useCallback(
    async (values: OIDCFormValues) => {
      // Run the connection check before saving — will throw on failure
      await runCheck(values);

      const providerData = formValuesToProvider(values);

      if (isExisting && existingProvider) {
        const { key: _key, ...updateData } = providerData;
        await updateProvider({
          key: existingProvider.key,
          provider: updateData,
        }).unwrap();
      } else {
        await createProvider(providerData as CustomOidcConfig).unwrap();
      }
    },
    [isExisting, existingProvider, createProvider, updateProvider, runCheck],
  );

  const [isDeleteModalOpen, deleteModal] = useDisclosure(false);

  const handleDelete = useCallback(async () => {
    if (!existingProvider) {
      return;
    }
    try {
      await deleteProvider(existingProvider.key).unwrap();
      sendToast({
        message: t`OIDC provider deleted`,
        icon: "check",
      });
    } catch (error) {
      sendToast({
        message: t`Failed to delete OIDC provider`,
        icon: "warning",
      });
    } finally {
      deleteModal.close();
    }
  }, [existingProvider, deleteProvider, sendToast, deleteModal]);

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <SettingsPageWrapper title={t`OpenID Connect`}>
      <SettingsSection>
        <FormProvider
          initialValues={initialValues}
          onSubmit={handleSubmit}
          validationSchema={getOidcFormSchema()}
          enableReinitialize
        >
          {({ dirty, values }) => (
            <Form>
              <FormSection title={t`Provider details`}>
                <Stack gap="md">
                  <FormTextInput
                    name="key"
                    label={t`Key`}
                    description={t`URL-safe identifier used in the SSO URL path. Your OIDC redirect URI will be "/auth/sso/{THIS_VALUE}/callback"`}
                    placeholder={t`e.g. okta`}
                    required
                    disabled={isExisting}
                  />
                  <FormTextInput
                    name="login-prompt"
                    label={t`Login prompt`}
                    placeholder={t`e.g. Sign in with Okta`}
                    required
                  />
                  <FormTextInput
                    name="issuer-uri"
                    label={t`Issuer URI`}
                    description={t`The OIDC issuer URI. The path "/.well-known/openid-configuration" should exist under this URI.`}
                    placeholder="https://your-idp.example.com"
                    required
                  />
                  <FormTextInput
                    name="client-id"
                    label={t`Client ID`}
                    required
                  />
                  <FormTextInput
                    name="client-secret"
                    label={t`Client Secret`}
                    type="password"
                    placeholder={
                      isExisting ? t`Leave blank to keep current value` : ""
                    }
                  />
                </Stack>
              </FormSection>

              <FormSection title={t`Optional settings`} collapsible>
                <Stack gap="md">
                  <FormSwitch
                    name="auto-provision"
                    label={t`User provisioning`}
                    description={t`When enabled, automatically create a ${applicationName} account when a user logs in via this OIDC provider for the first time.`}
                  />
                  <FormTextInput
                    name="scopes"
                    label={t`Scopes`}
                    description={t`Comma-separated list of OIDC scopes to request.`}
                    nullable
                  />
                  <FormTextInput
                    name="icon-url"
                    label={t`Icon URL`}
                    description={t`URL to an icon to display on the login button.`}
                    nullable
                  />
                  <FormTextInput
                    name="button-color"
                    label={t`Button color`}
                    description={t`CSS color for the login button.`}
                    placeholder={t`e.g. blue`}
                    nullable
                  />
                </Stack>
              </FormSection>

              <FormSection title={t`Attribute mapping`} collapsible>
                <Text c="text-secondary" mb="md">
                  {t`Map OIDC claims to user attributes. Use standard OIDC claim names or your provider's custom claims.`}
                </Text>
                <Stack gap="md">
                  <FormTextInput
                    name="attribute-email"
                    label={t`Email attribute`}
                    nullable
                  />
                  <FormTextInput
                    name="attribute-firstname"
                    label={t`First name attribute`}
                    nullable
                  />
                  <FormTextInput
                    name="attribute-lastname"
                    label={t`Last name attribute`}
                    nullable
                  />
                </Stack>
              </FormSection>

              <FormErrorMessage />
              <Flex justify="space-between">
                {isExisting ? (
                  <>
                    <Button
                      variant="filled"
                      color="danger"
                      onClick={deleteModal.open}
                    >
                      {t`Delete configuration`}
                    </Button>
                    <ConfirmModal
                      opened={isDeleteModalOpen}
                      title={t`Delete this OIDC provider?`}
                      message={t`Users will no longer be able to sign in with this provider. This can't be undone.`}
                      onClose={deleteModal.close}
                      onConfirm={handleDelete}
                    />
                  </>
                ) : (
                  <span />
                )}
                <Flex gap="md">
                  <Button
                    variant="outline"
                    loading={isChecking}
                    disabled={!values["issuer-uri"] || !values["client-id"]}
                    onClick={() =>
                      handleCheckConnection(values as OIDCFormValues)
                    }
                  >
                    {t`Check connection`}
                  </Button>
                  <FormSubmitButton
                    disabled={!dirty}
                    label={isExisting ? t`Save changes` : t`Save and enable`}
                    variant="filled"
                  />
                </Flex>
              </Flex>
            </Form>
          )}
        </FormProvider>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
