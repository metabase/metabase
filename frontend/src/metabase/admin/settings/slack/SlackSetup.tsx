import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { jt, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  useGetSlackManifestQuery,
  useUpdateSlackSettingsMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import {
  ButtonLink,
  ExternalLink,
} from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  Stack,
  Text,
} from "metabase/ui";

import { SlackConfiguration } from "./SlackConfiguration";
import { SlackSetupForm } from "./SlackSetupForm";

const SlackConnectionStatus = ({
  isValid,
  docsUrl,
}: {
  isValid: boolean;
  docsUrl: string;
}) => {
  const [updateSlackSettings] = useUpdateSlackSettingsMutation();
  const [isOpened, { open: handleOpen, close: handleClose }] =
    useDisclosure(false);

  const handleDisconnect = () => {
    updateSlackSettings({ "slack-app-token": null });
    handleClose();
  };

  return (
    <>
      <Flex justify="space-between" align="center">
        <Flex align="center" gap="sm">
          <Badge
            circle
            size="12"
            bg={isValid ? "success" : "error"}
            style={{ flexShrink: 0 }}
          />
          <Text>
            {isValid ? t`Slack app is working` : t`Slack app is not working.`}
          </Text>
          {!isValid && (
            <Text ml="sm" inline>
              {jt`Need help? ${(<ExternalLink key="link" href={docsUrl}>{t`See our docs`}</ExternalLink>)}.`}
            </Text>
          )}
        </Flex>

        <Button c="danger" onClick={handleOpen}>{t`Disconnect`}</Button>
      </Flex>
      <ConfirmModal
        opened={isOpened}
        onClose={handleClose}
        title={t`Disconnect Slack?`}
        message={t`This will stop dashboard subscriptions from appearing in Slack until you reconnect.`}
        confirmButtonText={t`Disconnect`}
        onConfirm={handleDisconnect}
      />
    </>
  );
};

export const SlackSetup = () => {
  const slackAppToken = useSetting("slack-app-token");
  const hasCompletedSetup = !!slackAppToken;
  const isValid = useSetting("slack-token-valid?") ?? false;
  const { url: docsUrl } = useDocsUrl("configuring-metabase/slack");

  const { data: manifest } = useGetSlackManifestQuery();

  const link = useMemo(() => {
    if (!manifest) {
      return "/apps";
    }
    const encodedManifest = encodeURIComponent(JSON.stringify(manifest));
    return `/apps?new_app=1&manifest_json=${encodedManifest}`;
  }, [manifest]);

  if (!hasCompletedSetup) {
    return (
      <SettingsSection title={t`Create a Slack app and connect to it.`}>
        <Stack gap="md">
          <Markdown>
            {t`First, **click the button below** to create your Slack App using the Metabase configuration.`}
          </Markdown>
          <Box>
            <ButtonLink href={`https://api.slack.com${link}`}>
              <span>{t`Create Slack App`}</span>
              <Icon name="external" opacity={0.7} ml="md" />
            </ButtonLink>
          </Box>
          <Markdown>
            {t`First, click "**Install to workspace**" to authorize it, then copy the **Bot User OAuth Token** and paste it here.`}
          </Markdown>
          <SlackSetupForm
            initialValues={{
              "slack-app-token": slackAppToken ?? "",
            }}
          />
        </Stack>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection stackProps={{ pt: "lg" }}>
      <Box>
        <SlackConnectionStatus isValid={isValid} docsUrl={docsUrl} />
        <Divider w="calc(100% + 4rem)" ml="-2rem" my="lg" />
        <SlackConfiguration />
      </Box>
    </SettingsSection>
  );
};
