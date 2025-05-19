import { useMemo } from "react";
import { jt, t } from "ttag";

import {
  useGetAdminSettingsDetailsQuery,
  useGetSettingsQuery,
  useUpdateGoogleAuthMutation,
} from "metabase/api";
import {
  useDocsUrl,
  useHasTokenFeature,
  useSetting,
} from "metabase/common/hooks";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import ExternalLink from "metabase/core/components/ExternalLink";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Box, Stack, Text, Title } from "metabase/ui";
import type { SettingDefinition, Settings } from "metabase-types/api";

import { GOOGLE_SCHEMA } from "../../constants";

const ENABLED_KEY = "google-auth-enabled";
const CLIENT_ID_KEY = "google-auth-client-id";
const DOMAIN_KEY = "google-auth-auto-create-accounts-domain";

type GoogleAuthSettings = Pick<
  Settings,
  | "google-auth-enabled"
  | "google-auth-client-id"
  | "google-auth-auto-create-accounts-domain"
>;

export interface GoogleAuthFormProps {
  elements?: SettingDefinition[];
  settingValues?: Partial<Settings>;
  isEnabled: boolean;
  isSsoEnabled: boolean;
  onSubmit: (settingValues: Partial<Settings>) => void;
}

export const GoogleAuthForm = (): JSX.Element => {
  const { data: settingValues } = useGetSettingsQuery();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const [updateGoogleAuthSettings] = useUpdateGoogleAuthMutation();

  const initialValues = useMemo(() => {
    const values = GOOGLE_SCHEMA.cast(settingValues, { stripUnknown: true });
    return { ...values, [ENABLED_KEY]: true };
  }, [settingValues]);

  const { url: docsUrl } = useDocsUrl("people-and-groups/google-and-ldap", {
    anchor: "enabling-google-sign-in",
  });

  const onSubmit = (values: GoogleAuthSettings) => {
    return updateGoogleAuthSettings(values).unwrap();
  };

  const hasTokenFeature = useHasTokenFeature("sso_google");
  const isGoogleAuthEnabled = useSetting("google-auth-enabled");

  return (
    <FormProvider
      initialValues={initialValues}
      enableReinitialize
      validationSchema={GOOGLE_SCHEMA}
      validationContext={settingValues}
      onSubmit={onSubmit}
    >
      {({ dirty }) => (
        <Form disabled={!dirty}>
          <Breadcrumbs
            crumbs={[
              [t`Authentication`, "/admin/settings/authentication"],
              [t`Google Sign-In`],
            ]}
          />
          <Stack gap="md" maw="32.5rem">
            <Title order={2} mt="lg">{t`Sign in with Google`}</Title>
            <Text c="text-medium">
              {t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`}
            </Text>
            <Text c="text-medium">
              {jt`To allow users to sign in with Google you'll need to give Metabase a Google Developers console application client ID. It only takes a few steps and instructions on how to create a key can be found ${(
                <ExternalLink key="link" href={docsUrl}>
                  {t`here`}
                </ExternalLink>
              )}.`}
            </Text>
            <FormTextInput
              name={CLIENT_ID_KEY}
              label={t`Client ID`}
              placeholder={t`{your-client-id}.apps.googleusercontent.com`}
              {...getEnvSettingProps(settingDetails?.[CLIENT_ID_KEY])}
            />
            <FormTextInput
              name={DOMAIN_KEY}
              label={t`Domain`}
              description={
                hasTokenFeature
                  ? t`Allow users to sign up on their own if their Google account email address is from one of the domains you specify here:`
                  : t`Allow users to sign up on their own if their Google account email address is from:`
              }
              placeholder={
                hasTokenFeature
                  ? "mycompany.com, example.com.br, otherdomain.co.uk"
                  : "mycompany.com"
              }
              nullable
              {...getEnvSettingProps(settingDetails?.[DOMAIN_KEY])}
            />
            <Box>
              <FormSubmitButton
                label={
                  isGoogleAuthEnabled ? t`Save changes` : t`Save and enable`
                }
                variant="filled"
                disabled={!dirty}
              />
            </Box>
            <FormErrorMessage />
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
};

const getEnvSettingProps = (setting?: SettingDefinition) => {
  if (setting?.is_env_setting) {
    return {
      description: t`Using ${setting.env_name}`,
      readOnly: true,
    };
  }
  return {};
};
