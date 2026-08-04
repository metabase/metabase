import { t } from "ttag";

import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";
import { ActionIcon, Box, Group, Icon, Stack, Text } from "metabase/ui";

const BANNER_ID = "data-apps-admin-settings-banner";

export const DataAppsBanner = () => (
  <UserHasSeen id={BANNER_ID}>
    {({ hasSeen, ack }) =>
      hasSeen ? null : (
        <Box
          pos="relative"
          p="lg"
          bg="background_surface-brand-subtle"
          bd="1px solid var(--mb-color-border-neutral)"
          bdrs="md"
        >
          <ActionIcon
            pos="absolute"
            top="1rem"
            right="1rem"
            variant="subtle"
            c="text-primary"
            aria-label={t`Dismiss`}
            onClick={ack}
          >
            <Icon name="close" />
          </ActionIcon>

          <Stack gap="sm">
            <Group gap="sm" wrap="nowrap" pr="xl">
              <Icon name="app" c="core-brand" flex="0 0 auto" />
              <Text fw={700} c="core-brand">
                {t`AI-generated React apps on top of your semantic layer`}
              </Text>
            </Group>

            {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin UI string */}
            <Text>{t`Have your AI agent of choice use Metabase's Data App skills to build a custom app backed by git, using the vetted metrics and data you've defined within Metabase.`}</Text>
          </Stack>
        </Box>
      )
    }
  </UserHasSeen>
);
