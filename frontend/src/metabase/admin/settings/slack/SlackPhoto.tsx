import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Box, Stack, Text } from "metabase/ui";

import { SetupSection } from "./SlackSetup";

export const SlackPhoto = () => (
  <SetupSection title={t`3. Give Metabot a profile photo`}>
    <Stack gap="sm">
      <Text>
        <ExternalLink href="/app/assets/img/metabot-slack-icon.png" download>
          {t`Download icon`}
        </ExternalLink>
        {t` and upload it in your Slack app's Basic Information settings.`}
      </Text>
      <Box
        component="img"
        src="/app/assets/img/metabot-slack-icon.png"
        alt="Metabot icon"
        width={64}
        height={64}
        bdrs="sm"
      />
    </Stack>
  </SetupSection>
);
