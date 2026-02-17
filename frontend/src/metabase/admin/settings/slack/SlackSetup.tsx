import { useMemo } from "react";
import { jt, t } from "ttag";

import { useGetSlackManifestQuery } from "metabase/api";
import {
  ButtonLink,
  ExternalLink,
} from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { Box, Center, Flex, Icon, Stack, Text } from "metabase/ui";

import { SlackSetupForm } from "./SlackSetupForm";
import { SetupSection } from "./SlackSetupSection";
import S from "./slack.module.css";

export const SlackSetup = ({
  hasCompletedSetup,
}: {
  hasCompletedSetup: boolean;
}) => {
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

  return (
    <Stack>
      <Text c="text-secondary">
        {t`Bring the power of Metabase to your Slack #channels.`}{" "}
        {t`Follow these steps to connect to Slack:`}
      </Text>

      <SetupSection title={t`1. Create and connect your Slack App`}>
        <Stack gap="md">
          {hasCompletedSetup ? (
            <Flex justify="space-between" align="center">
              <Center c={isValid ? "success" : "error"}>
                <Box className={S.StatusBadge} bg="currentColor" />
                <Text fw="bold" c="currentColor">
                  {isValid
                    ? t`Slack app is working`
                    : t`Slack app is not working.`}{" "}
                </Text>
              </Center>
              {!isValid && (
                <Text ml="sm" inline>
                  {jt`Need help? ${(<ExternalLink key="link" href={docsUrl}>{t`See our docs`}</ExternalLink>)}.`}
                </Text>
              )}
            </Flex>
          ) : (
            <>
              <Markdown>
                {t`First, **click the button below to create your Slack App** using the Metabase configuration. Once created, click "**Install to workspace**" to authorize it.`}
              </Markdown>
              <Box>
                <ButtonLink href={`https://api.slack.com${link}`}>
                  <span>{t`Create Slack App`}</span>
                  <Icon name="external" opacity={0.7} ml="md" />
                </ButtonLink>
              </Box>
              <Markdown>
                {t`Once installed, copy the **Bot User OAuth Token** and paste it here.`}
              </Markdown>
            </>
          )}

          <SlackSetupForm />
        </Stack>
      </SetupSection>
    </Stack>
  );
};
