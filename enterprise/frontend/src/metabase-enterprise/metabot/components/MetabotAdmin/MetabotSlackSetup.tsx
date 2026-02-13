import { match } from "ts-pattern";
import { t } from "ttag";

import { BasicAdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { SetupSection } from "metabase/admin/settings/slack/SlackSetup";
import { useAdminSettings } from "metabase/api/utils";
import { useAdminSetting } from "metabase/api/utils/settings";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Alert, Flex, Stack } from "metabase/ui";

export function MetabotSlackSetup() {
  const isValid = useSetting("slack-token-valid?") ?? false;
  const isEncrypted = useSetting("encryption-enabled");
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- admin only page
  const { url: encryptionDocsUrl } = useDocsUrl(
    "operations-guide/encrypting-database-details-at-rest",
  );

  const notification = match({ isEncrypted })
    .with({ isEncrypted: false }, () => "encryption")
    .otherwise(() => null);

  const slackAppToken = useSetting("slack-app-token");
  const { value: isEnabled, updateSetting } = useAdminSetting(
    "metabot-slack-bot-enabled",
  );
  const { values, updateSettings } = useAdminSettings([
    "metabot-slack-signing-secret",
    "slack-connect-client-id",
    "slack-connect-client-secret",
  ] as const);

  const isConfigured =
    !!slackAppToken && !Object.values(values).every((x) => !!x);
  const formDisabled = !slackAppToken || !!notification;
  const textInputsDisabled = formDisabled || !isEnabled;

  return (
    <>
      <SetupSection
        title={t`3. Give your Slack App the full power of Metabot`}
        isDisabled={!isValid}
      >
        <Stack gap="md">
          {notification === "encryption" && (
            <Alert
              color="brand"
              title={t`You must enabled encryption for your instance in order to user this feature`}
            >
              <ExternalLink href={encryptionDocsUrl}>
                {t`Learn how to enable encryption`}
              </ExternalLink>
            </Alert>
          )}

          {isConfigured && (
            <BasicAdminSettingInput
              name="metabot-slack-bot-enabled"
              inputType="boolean"
              disabled={formDisabled}
              value={isEnabled}
              onChange={(next) =>
                updateSetting({
                  key: "metabot-slack-bot-enabled",
                  value: !!next,
                })
              }
            />
          )}

          <Stack gap="sm">
            <FormProvider
              initialValues={values}
              onSubmit={updateSettings}
              enableReinitialize
            >
              <Form>
                <Stack gap="sm">
                  <FormTextInput
                    name="slack-connect-client-id"
                    label={t`Client ID`}
                    description={t`Found in your Slack app settings under Basic Information.`}
                    placeholder="123456789012.123456789012"
                    disabled={textInputsDisabled}
                  />
                  <FormTextInput
                    name="slack-connect-client-secret"
                    label={t`Client Secret`}
                    description={t`Found in your Slack app settings under Basic Information.`}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    disabled={textInputsDisabled}
                  />
                  <FormTextInput
                    name="metabot-slack-signing-secret"
                    label={t`Signing Secret`}
                    description={t`Found in your Slack app settings under Basic Information.`}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    disabled={textInputsDisabled}
                  />
                  <Flex justify="flex-end" mt="md">
                    <FormSubmitButton
                      label={t`Save changes`}
                      variant="filled"
                      disabled={textInputsDisabled}
                    />
                  </Flex>
                </Stack>
              </Form>
            </FormProvider>
          </Stack>
        </Stack>
      </SetupSection>
    </>
  );
}
