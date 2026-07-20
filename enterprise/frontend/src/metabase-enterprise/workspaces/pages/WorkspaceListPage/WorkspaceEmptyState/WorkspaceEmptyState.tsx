import { jt, t } from "ttag";

import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { Link } from "metabase/router";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Anchor,
  Box,
  Card,
  Divider,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database } from "metabase-types/api";

import { getEligibleDatabases } from "../../../utils";
import { NewWorkspaceButton } from "../NewWorkspaceButton";

import S from "./WorkspaceEmptyState.module.css";

export type WorkspaceEmptyStateProps = {
  databases: Database[];
};

export function WorkspaceEmptyState({ databases }: WorkspaceEmptyStateProps) {
  const applicationName = useSelector(getApplicationName);

  const { url: fileBasedDevDocsUrl, showMetabaseLinks: showFileBasedDevLink } =
    useDocsUrl("ai/file-based-development");
  const { url: remoteSyncDocsUrl, showMetabaseLinks: showRemoteSyncLink } =
    useDocsUrl("installation-and-operation/remote-sync");

  return (
    <Card p="xl" maw="40rem" mx="auto" shadow="none" withBorder>
      <Box p="md">
        <Title
          order={3}
          mb="sm"
        >{t`Use Workspaces to develop your semantic layer safely`}</Title>
        <Text mb="lg">
          {t`While in a workspace, ${applicationName} will remap tables created by transforms to an isolated schema, letting you test and build on top of these tables. When you're ready, use remote sync to pull your changes into your production ${applicationName}.`}
        </Text>
        <CreateWorkspaceSection databases={databases} />
        {(showFileBasedDevLink || showRemoteSyncLink) && (
          <>
            <Divider my="xl" />
            <Group gap="sm" align="stretch">
              {showFileBasedDevLink && (
                <DocsLink
                  title={t`Agent-driven development`}
                  description={t`How to use the CLI to develop content locally.`}
                  link={fileBasedDevDocsUrl}
                />
              )}
              {showRemoteSyncLink && (
                <DocsLink
                  title={t`Using remote sync`}
                  description={t`How to sync and review ${applicationName} content with git.`}
                  link={remoteSyncDocsUrl}
                />
              )}
            </Group>
          </>
        )}
      </Box>
    </Card>
  );
}

type CreateWorkspaceSectionProps = {
  databases: Database[];
};

function CreateWorkspaceSection({ databases }: CreateWorkspaceSectionProps) {
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  const hasEligibleDatabase = getEligibleDatabases(databases).length > 0;

  if (!hasEligibleDatabase) {
    return (
      <Text>
        {jt`You need to enable workspaces on at least one database. You can do this in ${(
          <Anchor
            key="link"
            component={Link}
            to={Urls.viewDatabases()}
          >{t`admin settings`}</Anchor>
        )}.`}
      </Text>
    );
  }

  if (!isRemoteSyncEnabled) {
    return (
      <Text>
        {jt`You need to set up remote sync. You can do this in ${(
          <Anchor
            key="link"
            component={Link}
            to={Urls.remoteSyncSettings()}
          >{t`admin settings`}</Anchor>
        )}.`}
      </Text>
    );
  }

  return <NewWorkspaceButton databases={databases} primary />;
}

type DocsLinkProps = {
  title: string;
  description: string;
  link: string;
};

function DocsLink({ title, description, link }: DocsLinkProps) {
  return (
    <Box
      className={S.docsLink}
      component={Link}
      to={link}
      target="_blank"
      rel="noreferrer"
      p="md"
      bdrs="md"
      flex="1"
      miw="16rem"
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <FixedSizeIcon c="core-brand" name="reference" />
        <Stack gap="xs">
          <Title order={5}>{title}</Title>
          <Box c="text-secondary">{description}</Box>
        </Stack>
      </Group>
    </Box>
  );
}
