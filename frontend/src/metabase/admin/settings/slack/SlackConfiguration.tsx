import { t } from "ttag";

import { useGetSlackAppInfoQuery } from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSetting } from "metabase/common/hooks";
import { Box, Button, Flex, Stack, Text } from "metabase/ui";

import { SlackBugReportChannelInput } from "./SlackBugReportChannelInput";

export const SlackConfiguration = () => {
  const bugReportingEnabled = useSetting("bug-reporting-enabled") ?? false;
  const { data: appInfo } = useGetSlackAppInfoQuery();

  const iconUrl = "/app/assets/img/metabot-slack-icon.png";
  const basicInfoUrl = appInfo?.app_id
    ? `https://api.slack.com/apps/${appInfo.app_id}/general#edit`
    : `https://api.slack.com/apps`;

  return (
    <Stack gap="md">
      <Box>
        <Text fz="lg" fw="bold">{t`Slack app icon`}</Text>
        <Text c="text-secondary">
          {t`Give your app all the bells and whistles.`}
        </Text>
      </Box>

      <Flex gap="md" align="center">
        <Box
          component="img"
          src={iconUrl}
          alt="Metabot icon"
          w={80}
          h={80}
          bdrs="sm"
        />
        <Stack gap="sm" align="flex-start">
          <Button
            variant="filled"
            component="a"
            href={iconUrl}
            display="inline-block"
            download="metabot-slack-icon.png"
          >
            {t`Download App Icon`}
          </Button>
          <Text c="text-secondary">
            {t`Add this icon to your App's `}
            <ExternalLink
              href={basicInfoUrl}
            >{t`Basic Information`}</ExternalLink>
            {t` settings`}
          </Text>
        </Stack>
      </Flex>

      {bugReportingEnabled && <SlackBugReportChannelInput />}
    </Stack>
  );
};
