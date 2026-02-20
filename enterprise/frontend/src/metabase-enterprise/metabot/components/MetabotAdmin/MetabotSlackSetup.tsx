import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { P, match } from "ts-pattern";
import { c, t } from "ttag";
import * as Yup from "yup";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { BasicAdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import {
  useGetSlackAppInfoQuery,
  useGetSlackManifestQuery,
} from "metabase/api/slack";
import { useAdminSetting, useAdminSettings } from "metabase/api/utils/settings";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Accordion, Button, Flex, Stack, Text } from "metabase/ui";
import { useUpdateMetabotSlackSettingsMutation } from "metabase-enterprise/api/metabot";
import type { SlackAppInfo } from "metabase-types/api/slack";

import {
  EncryptionRequiredAlert,
  MissingScopesAlert,
} from "./MetabotSlackSetupAlerts";

const VALIDATION_SCHEMA = Yup.object({
  "slack-connect-client-id": Yup.string().required(Errors.required),
  "slack-connect-client-secret": Yup.string().required(Errors.required),
  "metabot-slack-signing-secret": Yup.string().required(Errors.required),
});

type MetabotSlackSettingsFormValues = {
  "slack-connect-client-id": string | null | undefined;
  "slack-connect-client-secret": string | null | undefined;
  "metabot-slack-signing-secret": string | null | undefined;
};

const MetabotSlackSettingsForm = ({
  appInfo,
  values,
  isConfigured,
}: {
  appInfo?: SlackAppInfo;
  values: MetabotSlackSettingsFormValues;
  isConfigured: boolean;
}) => {
  const [updateMetabotSlackSettings] = useUpdateMetabotSlackSettingsMutation();

  const basicInfoUrl = appInfo?.app_id
    ? `https://api.slack.com/apps/${appInfo.app_id}/general`
    : `https://api.slack.com/apps`;

  const basicInfoLink = (
    <ExternalLink key="link" href={basicInfoUrl}>
      {t`Basic Information`}
    </ExternalLink>
  );

  return (
    <Stack gap="sm">
      <Text c="text-secondary">
        {c("{0} is a link that says 'Basic Information'.")
          .jt`You'll find this in your Slack app's ${basicInfoLink} settings.`}
      </Text>
      <FormProvider
        initialValues={{
          "slack-connect-client-id": values["slack-connect-client-id"] ?? "",
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
              disabled={isConfigured}
            />
            <FormTextInput
              name="slack-connect-client-secret"
              label={t`Client Secret`}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              disabled={isConfigured}
            />
            <FormTextInput
              name="metabot-slack-signing-secret"
              label={t`Signing Secret`}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              disabled={isConfigured}
            />
            {!isConfigured && (
              <Flex justify="flex-end" mt="md">
                <FormSubmitButton label={t`Save changes`} variant="filled" />
              </Flex>
            )}
          </Stack>
        </Form>
      </FormProvider>
    </Stack>
  );
};

export function MetabotSlackSetup() {
  const isSlackTokenValid = useSetting("slack-token-valid?") ?? false;
  const isEncryptionEnabled = useSetting("encryption-enabled");

  const { values } = useAdminSettings([
    "slack-connect-client-id",
    "slack-connect-client-secret",
    "metabot-slack-signing-secret",
  ] as const);
  const isConfigured = Object.values(values).every(Boolean);

  const { value: isEnabled, updateSetting: updateEnabledSetting } =
    useAdminSetting("slack-connect-enabled");

  const [updateMetabotSlackSettings] = useUpdateMetabotSlackSettingsMutation();
  const [isOpened, { open: handleOpen, close: handleClose }] =
    useDisclosure(false);

  const handleRemove = () => {
    updateMetabotSlackSettings({
      "slack-connect-client-id": null,
      "slack-connect-client-secret": null,
      "metabot-slack-signing-secret": null,
    });
    handleClose();
  };

  const [shouldPollAppInfo, setShouldPollAppInfo] = useState(false);
  const { data: manifest } = useGetSlackManifestQuery();
  const { data: appInfo } = useGetSlackAppInfoQuery(undefined, {
    skip: !isSlackTokenValid,
    pollingInterval: shouldPollAppInfo ? 10 * 1000 : 0,
  });

  const hasMissingScopes = (appInfo?.scopes?.missing?.length ?? 0) > 0;
  const notification = match({ isEncryptionEnabled, hasMissingScopes })
    .with({ isEncryptionEnabled: false }, () => "encryption" as const)
    .with({ hasMissingScopes: true }, () => "scopes" as const)
    .otherwise(() => null);
  useEffect(() => {
    setShouldPollAppInfo(notification === "scopes");
  }, [notification]);

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- admin only page
  const { url: encryptionDocsUrl } = useDocsUrl(
    "operations-guide/encrypting-database-details-at-rest",
  );

  if (!isSlackTokenValid) {
    return null;
  }

  return (
    <>
      <SettingsSection
        title={t`Natural language questions in Slack`}
        description={t`Add a few more details to unlock the full power of Metabot in Slack.`}
      >
        <Stack gap="lg">
          {notification === "encryption" && (
            <EncryptionRequiredAlert docsUrl={encryptionDocsUrl} />
          )}

          {notification === "scopes" && (
            <MissingScopesAlert manifest={manifest} appInfo={appInfo} />
          )}

          {match({ notification, isConfigured })
            .with({ isConfigured: true }, () => (
              <>
                <BasicAdminSettingInput
                  name="slack-connect-enabled"
                  inputType="boolean"
                  value={isEnabled}
                  switchLabel={t`Let people chat with Metabot`}
                  onChange={(next) =>
                    updateEnabledSetting({
                      key: "slack-connect-enabled",
                      value: !!next,
                    })
                  }
                />
                <ConnectionDetails>
                  <MetabotSlackSettingsForm
                    appInfo={appInfo}
                    values={values}
                    isConfigured={isConfigured}
                  />
                </ConnectionDetails>
                <Flex justify="flex-end">
                  <Button c="danger" onClick={handleOpen}>{t`Remove`}</Button>
                </Flex>
              </>
            ))
            .with({ notification: P.string }, () => null)
            .with({ isConfigured: false }, () => (
              <MetabotSlackSettingsForm
                appInfo={appInfo}
                values={values}
                isConfigured={isConfigured}
              />
            ))
            .exhaustive()}
        </Stack>
      </SettingsSection>
      <ConfirmModal
        opened={isOpened}
        onClose={handleClose}
        title={t`Clear Metabot settings?`}
        message={t`This will remove the configuration needed to power Metabot. People will no longer be able to chat with Metabot in Slack until you reconfigure these settings.`}
        confirmButtonText={t`Clear settings`}
        onConfirm={handleRemove}
      />
    </>
  );
}

function ConnectionDetails({ children }: { children: React.ReactNode }) {
  return (
    <Accordion variant="contained" radius="md">
      <Accordion.Item value="connection">
        <Accordion.Control>{t`View connection details`}</Accordion.Control>
        <Accordion.Panel>
          <Stack pt="md" pb="sm">
            {children}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
