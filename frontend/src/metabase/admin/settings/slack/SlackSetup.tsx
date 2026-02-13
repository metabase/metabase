import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import {
  useGetSlackManifestQuery,
  useGetSlackbotManifestQuery,
} from "metabase/api";
import { ButtonLink } from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Divider, Icon, Stack, Text, Title } from "metabase/ui";

import { SlackSetupForm } from "./SlackSetupForm";
import S from "./slack.module.css";

export const SlackSetup = () => {
  return (
    <Stack>
      <Text c="text-secondary">
        {t`Bring the power of Metabase to your Slack #channels.`}{" "}
        {t`Follow these steps to connect to Slack:`}
      </Text>
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
            {t`On the **Installed App Settings** page, copy the **Bot User OAuth Token** and paste it here.`}
          </Markdown>
        </Text>
        <SlackSetupForm />
      </SetupSection>
    </Stack>
  );
};

export const SetupSection = ({
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
    <ButtonLink href={`https://api.slack.com${link}`}>
      <span>{t`Create Slack App`}</span>
      <Icon name="external" opacity={0.7} ml="md" />
    </ButtonLink>
  );
};
