import { type ReactNode, useMemo } from "react";
import { jt, t } from "ttag";

import {
  useGetSlackManifestQuery,
  useGetSlackbotManifestQuery,
} from "metabase/api";
import {
  ButtonLink,
  ExternalLink,
} from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  Box,
  Center,
  Divider,
  Flex,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { SlackSetupForm } from "./SlackSetupForm";
import S from "./slack.module.css";

export const SlackSetup = ({
  hasCompletedSetup,
}: {
  hasCompletedSetup: boolean;
}) => {
  // TODO: merge this at the API level instead... hacking for now
  const { data: manifestOld } = useGetSlackManifestQuery(undefined, {
    skip: !PLUGIN_METABOT.isEnabled(),
  });
  const { data: manifestNew } = useGetSlackbotManifestQuery(undefined, {
    skip: PLUGIN_METABOT.isEnabled(),
  });

  const linkOld = manifestOld
    ? `/apps?new_app=1&manifest_yaml=${encodeURIComponent(manifestOld)}`
    : "/apps";

  const linkNew = useMemo(() => {
    const encodedManifest = encodeURIComponent(JSON.stringify(manifestNew));
    return manifestNew
      ? `/apps?new_app=1&manifest_json=${encodedManifest}`
      : "/apps";
  }, [manifestNew]);

  const link = PLUGIN_METABOT.isEnabled() ? linkNew : linkOld;

  return (
    <Stack>
      <Text c="text-secondary">
        {t`Bring the power of Metabase to your Slack #channels.`}{" "}
        {t`Follow these steps to connect to Slack:`}
      </Text>

      <SetupSection title={t`1. Create and connect your Slack App`}>
        {hasCompletedSetup ? (
          <SlackStatus />
        ) : (
          <Stack gap="md">
            <Text>
              <Markdown>
                {t`First, **click the button below to create your Slack App** using the Metabase configuration. Once created, click "**Install to workspace**" to authorize it.`}
              </Markdown>
            </Text>
            <Box>
              <ButtonLink href={`https://api.slack.com${link}`}>
                <span>{t`Create Slack App`}</span>
                <Icon name="external" opacity={0.7} ml="md" />
              </ButtonLink>
            </Box>
            <Markdown>
              {t`Once installed, copy the **Bot User OAuth Token** and paste it here.`}
            </Markdown>
            <SlackSetupForm />
          </Stack>
        )}
      </SetupSection>
    </Stack>
  );
};

export const SetupSection = ({
  title,
  children,
  isDisabled,
}: {
  title: string;
  children?: ReactNode;
  isDisabled?: boolean;
}) => {
  return (
    <Box className={S.SetupSection}>
      <Title order={4} p="md" c={isDisabled ? "text-tertiary" : "brand"}>
        {title}
      </Title>
      {!isDisabled && (
        <>
          <Divider />
          <Box p="md">{children}</Box>
        </>
      )}
    </Box>
  );
};

export const SlackStatus = () => {
  const { url: docsUrl } = useDocsUrl("configuring-metabase/slack");
  const isValid = useSetting("slack-token-valid?") ?? false;
  const color = isValid ? "success" : "error";

  return (
    <Stack gap="lg">
      <Flex justify="space-between" align="center">
        <Center>
          <Box className={S.StatusBadge} bg={color} />
          <Text fw="bold" c={color}>
            {isValid ? t`Slack app is working` : t`Slack app is not working.`}
          </Text>
        </Center>

        {!isValid && (
          <Text ml="sm" inline>
            {jt`Need help? ${(
              <ExternalLink
                key="link"
                href={docsUrl}
              >{t`See our docs`}</ExternalLink>
            )}.`}
          </Text>
        )}
      </Flex>

      <SlackSetupForm />
    </Stack>
  );
};
