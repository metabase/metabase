import { useId } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";
import { useDocsUrl } from "metabase/common/hooks";
import {
  ActionIcon,
  Card,
  Center,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";

const BUILD_GUIDE_ID = "data-apps-build-guide";

export const getDataAppsIntroTitle = () => t`Apps built on your semantic layer`;

export const getDataAppsIntroDescription = () =>
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Data Studio is only for admins.
  t`Data apps are highly customizable applications built on top of your vetted metrics and data. Create a data app with your AI agent of choice and the Metabase CLI, then sync it with git, and choose which groups can open and use it.`;

export function DataAppBuildDocsLink() {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Data Studio is only for admins.
  const { url } = useDocsUrl("data-apps/build");

  return (
    <ExternalLink href={url}>{t`Learn how to build data apps`}</ExternalLink>
  );
}

export const DataAppBuildGuide = () => {
  const titleId = useId();

  return (
    <UserHasSeen id={BUILD_GUIDE_ID}>
      {({ hasSeen, ack }) =>
        hasSeen ? null : (
          <Card
            component="section"
            withBorder
            p="lg"
            flex="0 0 auto"
            aria-labelledby={titleId}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Group gap="lg" align="flex-start" wrap="nowrap">
                <Center
                  w={80}
                  h={80}
                  bdrs="50%"
                  bg="background_surface-brand-subtle"
                  flex="0 0 auto"
                  mx="md"
                >
                  <FixedSizeIcon name="app" size={24} c="core-brand" />
                </Center>
                <Stack gap="sm">
                  <Title id={titleId} order={4}>
                    {getDataAppsIntroTitle()}
                  </Title>
                  <Text c="text-secondary" lh="1.25rem">
                    {getDataAppsIntroDescription()}
                  </Text>
                  <DataAppBuildDocsLink />
                </Stack>
              </Group>
              <ActionIcon
                variant="subtle"
                aria-label={t`Dismiss`}
                onClick={ack}
              >
                <FixedSizeIcon name="close" />
              </ActionIcon>
            </Group>
          </Card>
        )
      }
    </UserHasSeen>
  );
};
