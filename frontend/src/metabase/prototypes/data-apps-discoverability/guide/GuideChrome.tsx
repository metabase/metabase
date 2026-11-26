/* eslint-disable metabase/no-literal-metabase-strings -- PROTOTYPE: the guide's copy is plain English until a layout is picked. */
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useDocsUrl } from "metabase/common/hooks";
import { Badge, Box, Button, Group, Stack, Text, Title } from "metabase/ui";

import type { GuideStepAction } from "./use-guide-groups";

/** What a data app is, how the workflow goes, and what to have on hand. */
export const GuideHeader = () => (
  <Stack gap="md" component="header">
    <Group gap="sm" align="center">
      <Title order={1} fz="1.75rem">
        Build your first data app
      </Title>
      <Badge variant="light">Beta</Badge>
    </Group>
    <Text c="text-primary" lh="1.5rem" maw="40rem">
      A data app is a custom app that an AI coding agent builds on your
      Metabase data. Like a dashboard, a data app shows charts and tables. But
      a data app can also have its own layout, its own pages, and forms that
      add, edit, or delete rows in your database.
    </Text>
    <Text c="text-primary" lh="1.5rem" maw="40rem">
      You describe the app to your agent and preview it on your computer. When
      you&apos;re happy with the app, your agent saves it to a Git repository,
      and Metabase gets the app from that repository.
    </Text>
    <Text c="text-secondary" lh="1.5rem" maw="40rem">
      You&apos;ll need an admin account, an AI coding agent like Claude Code or
      Codex, and Git with an account on GitHub, GitLab, or Bitbucket.
    </Text>
  </Stack>
);

/** Where to go once the first app is live. */
export const GuideFooter = () => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- PROTOTYPE: only admins can build data apps.
  const { url: gettingStartedUrl } = useDocsUrl("data-apps/getting-started");
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- PROTOTYPE: only admins can build data apps.
  const { url: referenceUrl } = useDocsUrl("data-apps/build");
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- PROTOTYPE: only admins can build data apps.
  const { url: manageUrl } = useDocsUrl("data-apps/manage");

  return (
    <Box component="footer">
      <Title order={3} mb="sm">
        Go further with the docs
      </Title>
      <Text c="text-primary" lh="1.5rem" maw="40rem">
        The docs cover what this page leaves out, like editing an app, forms
        that change data, and reviewing each app on a development Metabase
        before it reaches production. Take a look at{" "}
        <ExternalLink href={gettingStartedUrl}>
          Getting started with data apps
        </ExternalLink>
        , the <ExternalLink href={referenceUrl}>data apps reference</ExternalLink>
        , and <ExternalLink href={manageUrl}>Manage data apps</ExternalLink>.
      </Text>
    </Box>
  );
};

/** The in-product shortcut for a step that happens in Metabase. */
export const GuideStepActionButton = ({
  action,
}: {
  action: GuideStepAction;
}) => (
  <Box>
    <Button component={ForwardRefLink} to={action.to} variant="default">
      {action.label}
    </Button>
  </Box>
);
