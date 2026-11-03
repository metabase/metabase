import { useId } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";
import { useDocsUrl } from "metabase/common/hooks";
import {
  ActionIcon,
  Card,
  FixedSizeIcon,
  Group,
  List,
  Stack,
  Title,
} from "metabase/ui";

const BUILD_GUIDE_ID = "data-apps-build-guide";

export function DataAppBuildSteps() {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Data Studio is only for admins.
  const { url } = useDocsUrl("data-apps/build");

  return (
    <Stack gap="md">
      <List type="ordered" spacing="xs">
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Data Studio is only for admins. */}
        <List.Item>{t`Install the Metabase CLI, and log it in to your Metabase as an admin.`}</List.Item>
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Data Studio is only for admins. */}
        <List.Item>{t`Start your AI coding agent in a local clone of your Git repository, on the branch your Metabase syncs with.`}</List.Item>
        <List.Item>{t`Ask your agent to create a data app. It writes the app's code, questions, and actions in the repository, builds the app, and pushes it.`}</List.Item>
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Data Studio is only for admins. */}
        <List.Item>{t`Pull the changes into Metabase. Your agent can do this for you.`}</List.Item>
        <List.Item>{t`Choose which groups can open the app.`}</List.Item>
      </List>
      <ExternalLink href={url}>{t`Learn how to build data apps`}</ExternalLink>
    </Stack>
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
              <Stack gap="sm">
                <Title id={titleId} order={4}>
                  {t`How to build a data app`}
                </Title>
                <DataAppBuildSteps />
              </Stack>
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
