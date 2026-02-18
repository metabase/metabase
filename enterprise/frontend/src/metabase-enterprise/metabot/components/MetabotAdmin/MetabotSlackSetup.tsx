import { useMemo } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";
import * as Yup from "yup";

import { BasicAdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { SetupSection } from "metabase/admin/settings/slack/SlackSetupSection";
import {
  useGetSlackAppInfoQuery,
  useGetSlackManifestQuery,
} from "metabase/api/slack";
import { useAdminSetting, useAdminSettings } from "metabase/api/utils/settings";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Flex, Stack, Text } from "metabase/ui";
import { useUpdateMetabotSlackSettingsMutation } from "metabase-enterprise/api/metabot";

import {
  EncryptionRequiredAlert,
  MissingScopesAlert,
} from "./MetabotSlackSetupAlerts";

export function MetabotSlackSetup() {
  const isSlackTokenValid = useSetting("slack-token-valid?") ?? false;
  const isEncryptionEnabled = useSetting("encryption-enabled");

  const VALIDATION_SCHEMA = useMemo(
    () =>
      Yup.object({
        "slack-connect-client-id": Yup.string().required(t`Required`),
        "slack-connect-client-secret": Yup.string().required(t`Required`),
        "metabot-slack-signing-secret": Yup.string().required(t`Required`),
      }),
    [],
  );

  const { values } = useAdminSettings([
    "slack-connect-client-id",
    "slack-connect-client-secret",
    "metabot-slack-signing-secret",
  ] as const);
  const isConfigured = Object.values(values).every(Boolean);

  const { value: isEnabled, updateSetting: updateEnabledSetting } =
    useAdminSetting("slack-connect-enabled");

  const [updateMetabotSlackSettings] = useUpdateMetabotSlackSettingsMutation();
  const { data: manifest } = useGetSlackManifestQuery();
  const { data: appInfo } = useGetSlackAppInfoQuery(undefined, {
    skip: !isSlackTokenValid,
  });

  const hasMissingScopes = (appInfo?.scopes?.missing?.length ?? 0) > 0;
  const notification = match({ isEncryptionEnabled, hasMissingScopes })
    .with({ isEncryptionEnabled: false }, () => "encryption" as const)
    .with({ hasMissingScopes: true }, () => "scopes" as const)
    .otherwise(() => null);

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- admin only page
  const { url: encryptionDocsUrl } = useDocsUrl(
    "operations-guide/encrypting-database-details-at-rest",
  );

  const basicInfoUrl = appInfo?.app_id
    ? `https://api.slack.com/apps/${appInfo.app_id}/general`
    : `https://api.slack.com/apps`;

  const basicInfoLink = (
    <ExternalLink key="link" href={basicInfoUrl}>
      {t`Basic Information`}
    </ExternalLink>
  );
  return (
    <SetupSection
      title={t`3. Give your Slack App the full power of Metabot`}
      isDisabled={!isSlackTokenValid}
    >
      <Stack gap="md">
        {notification === "encryption" && (
          <EncryptionRequiredAlert docsUrl={encryptionDocsUrl} />
        )}

        {notification === "scopes" && (
          <MissingScopesAlert manifest={manifest} appInfo={appInfo} />
        )}

        {notification === null && isConfigured && (
          <Stack gap="xs">
            <Text fw="bold">{t`Let people chat with Metabot`}</Text>
            <BasicAdminSettingInput
              name="slack-connect-enabled"
              inputType="boolean"
              value={isEnabled}
              onChange={(next) =>
                updateEnabledSetting({
                  key: "slack-connect-enabled",
                  value: !!next,
                })
              }
            />
          </Stack>
        )}

        {notification === null && (
          <Stack gap="sm">
            <Text c="text-secondary">{c(
              "{0} is a link that says 'Basic Information'.",
            )
              .jt`You'll find this in your Slack app's ${basicInfoLink} settings.`}</Text>
            <FormProvider
              initialValues={{
                "slack-connect-client-id":
                  values["slack-connect-client-id"] ?? "",
                "slack-connect-client-secret":
                  values["slack-connect-client-secret"] ?? "",
                "metabot-slack-signing-secret":
                  values["metabot-slack-signing-secret"] ?? "",
              }}
              validationSchema={VALIDATION_SCHEMA}
              onSubmit={updateMetabotSlackSettings}
              enableReinitialize
            >
              <Form>
                <Stack gap="sm">
                  <FormTextInput
                    name="slack-connect-client-id"
                    label={t`Client ID`}
                    placeholder="123456789012.123456789012"
                  />
                  <FormTextInput
                    name="slack-connect-client-secret"
                    label={t`Client Secret`}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  <FormTextInput
                    name="metabot-slack-signing-secret"
                    label={t`Signing Secret`}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  <Flex justify="flex-end" mt="md">
                    <FormSubmitButton
                      label={t`Save changes`}
                      variant="filled"
                    />
                  </Flex>
                </Stack>
              </Form>
            </FormProvider>
          </Stack>
        )}
      </Stack>
    </SetupSection>
  );
}
