import type { ReactNode } from "react";
import { t } from "ttag";

import { useGetSlackManifestQuery } from "metabase/api";
import { ButtonLink } from "metabase/common/components/ExternalLink";
import Markdown from "metabase/common/components/Markdown";
import { useSetting } from "metabase/common/hooks";
import { Box, Divider, Icon, Stack, Text, Title } from "metabase/ui";

import { SlackBadge } from "./SlackBadge";
import { SlackSetupForm } from "./SlackSetupForm";
import S from "./slack.module.css";

export const SlackSetup = () => {
  const botToken = useSetting("slack-token");
  const isValid = useSetting("slack-token-valid?");
  return (
    <Stack>
      <SetupHeader isBot={!!botToken} isValid={isValid} />
      <SetupSection
        title={t`1. Click the button below and create your Slack App`}
      >
        <Text>
          <Markdown>
            {t`First, **click the button below to create your Slack App** using the Metabase configuration. Once created, click "**Install to workspace**" to authorize it.`}
          </Markdown>
        </Text>
        <SlackAppsLink />
      </SetupSection>
      <SetupSection
        title={t`2. Activate the OAuth token and create a new slack channel`}
      >
        <Text mb="md">
          <Markdown>
            {t`Click on "**OAuth and Permissions**" in the sidebar, copy the "**Bot User OAuth Token**" and paste it here.`}
          </Markdown>
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
      {isBot ? (
        <Text>
          <SlackBadge isBot={isBot} isValid={isValid} />{" "}
          <Markdown>
            {t`We recommend you **upgrade to Slack Apps** see the instructions below:`}
          </Markdown>
        </Text>
      ) : (
        <Text c="text-secondary">
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
