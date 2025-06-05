import type { ReactNode } from "react";
import { jt, t } from "ttag";

import { useGetSlackManifestQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { ButtonLink } from "metabase/core/components/ExternalLink";
import { Box, Divider, Icon, Stack, Text, Title } from "metabase/ui";

import { SlackBadge } from "./SlackBadge";
import { SlackSetupForm } from "./SlackSetupForm";
import S from "./slack.module.css";

export const SlackSetup = () => {
  const botToken = useSetting("slack-token");
  const isValid = useSetting("slack-token-valid?");
  return (
    <Stack maw="40rem">
      <SetupHeader isBot={!!botToken} isValid={isValid} />
      <SetupSection
        title={t`1. Click the button below and create your Slack App`}
      >
        <Text>
          {jt`First, ${(
            <strong key="click-button">{t`click the button below to create your Slack App`}</strong>
          )} using the Metabase configuration. Once created, click “${(
            <strong key="install-app">{t`Install to workspace`}</strong>
          )}” to authorize it.`}
        </Text>
        <SlackAppsLink />
      </SetupSection>
      <SetupSection
        title={t`2. Activate the OAuth Token and create a new slack channel`}
      >
        <Text mb="md">
          {jt`Click on "${(
            <strong key="click">{t`OAuth and Permissions`}</strong>
          )}" in the sidebar, copy the “${(
            <strong key="token">{t`Bot User OAuth Token`}</strong>
          )}” and paste it here.`}
        </Text>
        <SlackSetupForm />
      </SetupSection>
    </Stack>
  );
};

const SetupHeader = ({
  isBot,
  isValid,
}: {
  isBot?: boolean;
  isValid?: boolean;
}) => {
  return (
    <Box>
      <Title order={2}>{t`Metabase on Slack`}</Title>
      {isBot ? (
        <Text>
          <SlackBadge isBot={isBot} isValid={isValid} />{" "}
          {jt`We recommend you ${(
            <strong key="apps">{t`upgrade to Slack Apps`}</strong>
          )}, see the instructions below:`}
        </Text>
      ) : (
        <Text c="text-medium">
          {t`Bring the power of Metabase to your Slack #channels.`}{" "}
          {t`Follow these steps to connect to Slack:`}
        </Text>
      )}
    </Box>
  );
};

const SetupSection = ({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) => {
  return (
    <Box className={S.SetupSection}>
      <Title order={4} p="md" c="brand">
        {title}
      </Title>
      <Divider />
      <Box p="md">{children}</Box>
    </Box>
  );
};

const SlackAppsLink = () => {
  const { data: manifest } = useGetSlackManifestQuery();

  const link = manifest
    ? `/apps?new_app=1&manifest_yaml=${encodeURIComponent(manifest)}`
    : "/apps";

  return (
    <ButtonLink href={`https://api.slack.com${link}`}>
      <span>{t`Create Slack App`}</span>
      <Icon name="external" opacity={0.7} ml="md" />
    </ButtonLink>
  );
};
