import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
import { Flex, Stack, Text, Title } from "metabase/ui";
import {
  type CustomOidcConfig,
  useCreateCustomOidcMutation,
  useGetCustomOidcProvidersQuery,
  useUpdateCustomOidcMutation,
} from "metabase-enterprise/api";

function getOidcFormSchema() {
  return Yup.object({
    "display-name": Yup.string().required(t`Display name is required`),
    name: Yup.string()
      .required(t`Provider slug is required`)
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
  "display-name": string;
  name: string;
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

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function providerToFormValues(
  provider: CustomOidcConfig | null,
): OIDCFormValues {
  if (!provider) {
    return {
      "display-name": "",
      name: "",
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
    "display-name": provider["display-name"] ?? "",
    name: provider.name ?? "",
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
    name: values.name,
    "display-name": values["display-name"],
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

export function SettingsOIDCForm() {
  const applicationName = useSelector(getApplicationName);
  const { data: providers, isLoading } = useGetCustomOidcProvidersQuery();
  const [createProvider] = useCreateCustomOidcMutation();
  const [updateProvider] = useUpdateCustomOidcMutation();

  const existingProvider =
    providers && providers.length > 0 ? providers[0] : null;
  const isExisting = existingProvider !== null;

  const [autoSlug, setAutoSlug] = useState(!isExisting);

  const initialValues = useMemo(
    () => providerToFormValues(existingProvider),
    [existingProvider],
  );

  const handleSubmit = useCallback(
    async (values: OIDCFormValues) => {
      const providerData = formValuesToProvider(values);

      if (isExisting && existingProvider) {
        await updateProvider({
          slug: existingProvider.name,
          provider: providerData,
        }).unwrap();
      } else {
        await createProvider(providerData as CustomOidcConfig).unwrap();
      }
    },
    [isExisting, existingProvider, createProvider, updateProvider],
  );

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <SettingsPageWrapper title={t`OIDC`}>
      <SettingsSection>
        <FormProvider
          initialValues={initialValues}
          onSubmit={handleSubmit}
          validationSchema={getOidcFormSchema()}
          enableReinitialize
        >
          {({ dirty, setFieldValue }) => (
            <Form>
              <Title order={2}>{t`Set up OIDC-based SSO`}</Title>
              <Text c="text-secondary" mb="xl">
                {t`Configure your OpenID Connect identity provider below. This works with Keycloak, Okta, Auth0, and other OIDC-compliant providers.`}
              </Text>

              <FormSection title={t`Provider details`}>
                <Stack gap="md">
                  <FormTextInput
                    name="display-name"
                    label={t`Display name`}
                    placeholder={t`e.g. Sign in with Okta`}
                    required
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      setFieldValue("display-name", val);
                      if (autoSlug) {
                        setFieldValue("name", slugify(val));
                      }
                    }}
                  />
                  <FormTextInput
                    name="name"
                    label={t`Provider slug`}
                    description={t`URL-safe identifier used in the SSO URL path.`}
                    placeholder={t`e.g. okta`}
                    required
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFieldValue("name", e.target.value);
                      setAutoSlug(false);
                    }}
                    disabled={isExisting}
                  />
                  <FormTextInput
                    name="issuer-uri"
                    label={t`Issuer URI`}
                    description={t`The OIDC issuer URL. Used for auto-discovery of endpoints.`}
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
              <Flex justify="end">
                <FormSubmitButton
                  disabled={!dirty}
                  label={isExisting ? t`Save changes` : t`Save and enable`}
                  variant="filled"
                />
              </Flex>
            </Form>
          )}
        </FormProvider>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
