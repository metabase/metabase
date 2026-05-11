import { Link } from "react-router";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { Button, Card, Group, Stack, Text, Title } from "metabase/ui";

export function WorkspaceEmptyState() {
  return (
    <Card p="lg" shadow="none" withBorder>
      <Stack>
        <Title order={4}>{t`Isolated spaces for agents and developers`}</Title>
        <Text maw="25rem">
          {t`Develop and run transforms, and build your semantic layer without touching your production tables.`}
        </Text>
        <Text maw="25rem">
          {
            // eslint-disable-next-line metabase/no-literal-metabase-strings -- referring to the product name is intentional
            t`Create a workspace with Metabase's CLI. That will set up an isolated sandbox with a dedicated schema and database user in the data warehouse(s) you choose.`
          }
        </Text>
        <HelpSection />
      </Stack>
    </Card>
  );
}

function HelpSection() {
  const { url: fileBasedDevDocsUrl, showMetabaseLinks: showFileBasedDevLink } =
    useDocsUrl("ai/file-based-development");
  const { url: remoteSyncDocsUrl, showMetabaseLinks: showRemoteSyncLink } =
    useDocsUrl("installation-and-operation/remote-sync");

  if (!showFileBasedDevLink && !showRemoteSyncLink) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Text>{t`Some resources to get you started:`}</Text>
      <Group gap="sm">
        {showFileBasedDevLink && (
          <Button
            component={Link}
            to={fileBasedDevDocsUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t`File-based development`}
          </Button>
        )}
        {showRemoteSyncLink && (
          <Button
            component={Link}
            to={remoteSyncDocsUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t`Using remote sync`}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
